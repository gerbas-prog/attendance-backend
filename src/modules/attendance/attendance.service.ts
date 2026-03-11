// src/modules/attendance/attendance.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { GeofenceUtil } from '../../common/utils/geofence.util';
import { AttendanceGateway } from '../../gateway/attendance.gateway';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { AttendanceFilterDto } from './dto/attendance-filter.dto';
import { AttendanceStatus } from '@prisma/client';
import * as dayjs from 'dayjs';
import * as timezone from 'dayjs/plugin/timezone';
import * as utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private geofence: GeofenceUtil,
    private gateway: AttendanceGateway,
  ) {}

  // ===========================
  // CHECK-IN
  // ===========================
  async checkIn(userId: string, dto: CheckInDto): Promise<any> {
    const user = await this.getUserWithDetails(userId);
    const today = dayjs().tz(user.company.timezone).format('YYYY-MM-DD');
    const todayDate = new Date(today);

    // Prevent duplicate check-in
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });

    if (existing?.checkInTime) {
      throw new BadRequestException('Anda sudah melakukan check-in hari ini');
    }

    // GPS Anti-spoofing check
    const spoofCheck = this.geofence.detectMockLocation(
      { latitude: dto.latitude, longitude: dto.longitude },
      dto.accuracy,
    );

    if (spoofCheck.isSuspicious) {
      this.logger.warn(`Suspicious GPS for user ${userId}: ${spoofCheck.reasons.join(', ')}`);
    }

    // Find nearest valid location
    const userLocations = await this.prisma.userLocation.findMany({
      where: { userId },
      include: { location: true },
    });

    if (!userLocations.length) {
      throw new ForbiddenException('Anda belum ditugaskan ke lokasi manapun');
    }

    const locations = userLocations
      .map((ul) => ul.location)
      .filter((location) => location && location.isActive);
    const nearest = this.geofence.findNearestLocation(
      { latitude: dto.latitude, longitude: dto.longitude },
      locations,
    );

    if (!nearest) throw new BadRequestException('Tidak ada lokasi valid yang ditemukan');

    // Apply GPS accuracy tolerance
    const effectiveRadius = nearest.location.radius + Math.min(dto.accuracy || 0, 30);
    const isValidLocation = nearest.distance <= effectiveRadius;

    if (!isValidLocation) {
      throw new BadRequestException(
        `Anda berada ${nearest.distance}m dari lokasi "${nearest.location.name}". ` +
          `Radius check-in adalah ${nearest.location.radius}m`,
      );
    }

    // Calculate late minutes
    const now = dayjs().tz(user.company.timezone);
    const shift = user.shift;
    let lateMinutes = 0;
    let status: AttendanceStatus = AttendanceStatus.PRESENT;

    if (shift) {
      const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
      const shiftStart = now.clone().hour(shiftHour).minute(shiftMin).second(0);
      const diffMinutes = now.diff(shiftStart, 'minute');

      if (diffMinutes > shift.lateThreshold) {
        lateMinutes = diffMinutes;
        status = AttendanceStatus.LATE;
      }
    }

    // Handle selfie URL
    const selfieUrl = dto.selfieUrl || null;

    // Upsert attendance record
    const attendance = await this.prisma.attendance.upsert({
      where: { userId_date: { userId, date: todayDate } },
      create: {
        userId,
        date: todayDate,
        locationId: nearest.location.id,
        shiftId: shift?.id,
        status,
        checkInTime: new Date(),
        checkInLat: dto.latitude,
        checkInLng: dto.longitude,
        checkInDistance: nearest.distance,
        checkInSelfie: selfieUrl,
        checkInNote: dto.note,
        checkInDevice: dto.deviceInfo,
        isCheckInValid: true,
        lateMinutes,
      },
      update: {
        locationId: nearest.location.id,
        status,
        checkInTime: new Date(),
        checkInLat: dto.latitude,
        checkInLng: dto.longitude,
        checkInDistance: nearest.distance,
        checkInSelfie: selfieUrl,
        checkInNote: dto.note,
        isCheckInValid: true,
        lateMinutes,
      },
      include: { location: true, shift: true },
    });

    // Emit real-time event
    await this.gateway.emitAttendanceUpdate(user.companyId, {
      type: 'CHECK_IN',
      userId,
      userName: user.fullName,
      location: nearest.location.name,
      time: new Date().toISOString(),
      status,
      lateMinutes,
    });

    // Cache today's status
    await this.redis.setJson(`attendance:today:${userId}`, attendance, 3600);

    this.logger.log(
      `✅ Check-in: ${user.fullName} @ ${nearest.location.name} | ${nearest.distance}m | ${status}`,
    );

    return {
      message: status === AttendanceStatus.LATE
        ? `Check-in berhasil. Anda terlambat ${lateMinutes} menit`
        : 'Check-in berhasil!',
      data: {
        ...attendance,
        distance: nearest.distance,
        locationName: nearest.location.name,
        isGpsSuspicious: spoofCheck.isSuspicious,
      },
    };
  }

  // ===========================
  // CHECK-OUT
  // ===========================
  async checkOut(userId: string, dto: CheckOutDto): Promise<any> {
    const user = await this.getUserWithDetails(userId);
    const today = dayjs().tz(user.company.timezone).format('YYYY-MM-DD');

    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: new Date(today) } },
      include: { location: true, shift: true },
    });

    if (!attendance) throw new BadRequestException('Anda belum melakukan check-in hari ini');
    if (attendance.checkOutTime) throw new BadRequestException('Anda sudah melakukan check-out');

    // Geofence check for checkout
    const geofenceResult = attendance.location
      ? this.geofence.isInsideGeofence(
          { latitude: dto.latitude, longitude: dto.longitude },
          { latitude: attendance.checkInLat!, longitude: attendance.checkInLng! },
          attendance.location.radius * 2, // slightly wider radius for checkout
          dto.accuracy,
        )
      : { isInside: true, distance: 0, accuracy: 'low' };

    // Calculate work duration and overtime
    const checkInTime = dayjs(attendance.checkInTime);
    const checkOutTime = dayjs();
    const workDuration = checkOutTime.diff(checkInTime, 'minute');

    let overtimeMinutes = 0;
    if (attendance.shift) {
      const [shiftHour, shiftMin] = attendance.shift.endTime.split(':').map(Number);
      const shiftEnd = checkOutTime.clone().hour(shiftHour).minute(shiftMin).second(0);
      const diffFromEnd = checkOutTime.diff(shiftEnd, 'minute');
      if (diffFromEnd > 0) overtimeMinutes = diffFromEnd;
    }

    const updated = await this.prisma.attendance.update({
      where: { userId_date: { userId, date: new Date(today) } },
      data: {
        checkOutTime: new Date(),
        checkOutLat: dto.latitude,
        checkOutLng: dto.longitude,
        checkOutDistance: geofenceResult.distance,
        checkOutSelfie: dto.selfieUrl,
        checkOutNote: dto.note,
        isCheckOutValid: geofenceResult.isInside,
        workDuration,
        overtimeMinutes,
      },
      include: { location: true, shift: true },
    });

    // Emit real-time update
    await this.gateway.emitAttendanceUpdate(user.companyId, {
      type: 'CHECK_OUT',
      userId,
      userName: user.fullName,
      location: attendance.location?.name,
      time: new Date().toISOString(),
      workDuration,
      overtimeMinutes,
    });

    // Invalidate cache
    await this.redis.del(`attendance:today:${userId}`);

    const hours = Math.floor(workDuration / 60);
    const minutes = workDuration % 60;

    return {
      message: `Check-out berhasil! Durasi kerja: ${hours} jam ${minutes} menit`,
      data: { ...updated, workDuration, overtimeMinutes },
    };
  }

  // ===========================
  // GET TODAY STATUS
  // ===========================
  async getTodayStatus(userId: string): Promise<any> {
    // Try cache first
    const cached = await this.redis.getJson(`attendance:today:${userId}`);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    const today = dayjs().tz(user.company.timezone).format('YYYY-MM-DD');

    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: new Date(today) } },
      include: { location: true, shift: true },
    });

    return attendance;
  }

  // ===========================
  // GET ATTENDANCE HISTORY
  // ===========================
  async getMyHistory(userId: string, filter: AttendanceFilterDto) {
    const { page = 1, limit = 20, startDate, endDate, status } = filter;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: { location: true, shift: true },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ===========================
  // ADMIN: Get all attendances
  // ===========================
  async getAllAttendances(companyId: string, filter: AttendanceFilterDto) {
    const { page = 1, limit = 20, startDate, endDate, status, userId } = filter;
    const skip = (page - 1) * limit;

    const where: any = {
      user: { companyId },
    };

    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, employeeId: true, department: true } },
          location: true,
          shift: true,
        },
        orderBy: [{ date: 'desc' }, { checkInTime: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ===========================
  // LIVE TRACKING - Today's overview for admin
  // ===========================
  async getLiveTracking(companyId: string): Promise<any> {
    const cacheKey = `live:tracking:${companyId}`;
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const today = dayjs().tz(company.timezone).format('YYYY-MM-DD');

    const [totalUsers, attendances] = await Promise.all([
      this.prisma.user.count({
        where: { companyId, isActive: true, role: { in: ['EMPLOYEE', 'SUPERVISOR'] } },
      }),
      this.prisma.attendance.findMany({
        where: { date: new Date(today), user: { companyId } },
        include: {
          user: { select: { id: true, fullName: true, employeeId: true, department: true, avatarUrl: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { checkInTime: 'desc' },
      }),
    ]);

    const checkedIn = attendances.filter((a) => a.checkInTime && !a.checkOutTime);
    const checkedOut = attendances.filter((a) => a.checkOutTime);
    const late = attendances.filter((a) => a.status === AttendanceStatus.LATE);
    const absent = totalUsers - attendances.length;

    const result = {
      summary: {
        totalUsers,
        present: attendances.length,
        checkedIn: checkedIn.length,
        checkedOut: checkedOut.length,
        late: late.length,
        absent,
        attendanceRate: Math.round((attendances.length / totalUsers) * 100),
      },
      liveUsers: checkedIn.map((a) => ({
        id: a.user.id,
        name: a.user.fullName,
        employeeId: a.user.employeeId,
        department: a.user.department,
        avatar: a.user.avatarUrl,
        location: a.location?.name,
        checkInTime: a.checkInTime,
        latitude: a.checkInLat,
        longitude: a.checkInLng,
        status: a.status,
      })),
      recentActivity: attendances.slice(0, 10),
    };

    await this.redis.setJson(cacheKey, result, 30); // cache 30 seconds
    return result;
  }

  // ===========================
  // PRIVATE HELPERS
  // ===========================
  private async getUserWithDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        shift: true,
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (!user.isActive) throw new ForbiddenException('Akun Anda tidak aktif');
    return user;
  }
}

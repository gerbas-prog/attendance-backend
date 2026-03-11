// src/modules/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AttendanceStatus } from '@prisma/client';
import * as dayjs from 'dayjs';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getAdminOverview(companyId: string) {
    const cacheKey = `dashboard:overview:${companyId}`;
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const today = dayjs().format('YYYY-MM-DD');
    const thisMonth = dayjs().startOf('month').toDate();
    const lastMonth = dayjs().subtract(1, 'month').startOf('month').toDate();
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month').toDate();

    const [
      totalEmployees,
      todayAttendances,
      monthlyAttendances,
      lastMonthAttendances,
      pendingLeaves,
      locationCount,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { companyId, isActive: true, role: { in: ['EMPLOYEE', 'SUPERVISOR'] } },
      }),
      this.prisma.attendance.findMany({
        where: { date: new Date(today), user: { companyId } },
        include: { user: { select: { fullName: true, department: true } } },
      }),
      this.prisma.attendance.count({
        where: { date: { gte: thisMonth }, user: { companyId } },
      }),
      this.prisma.attendance.count({
        where: { date: { gte: lastMonth, lte: lastMonthEnd }, user: { companyId } },
      }),
      this.prisma.leaveRequest.count({
        where: { status: 'PENDING', user: { companyId } },
      }),
      this.prisma.location.count({ where: { companyId, isActive: true } }),
    ]);

    const todayPresent = todayAttendances.length;
    const todayLate = todayAttendances.filter((a) => a.status === AttendanceStatus.LATE).length;
    const todayCheckedOut = todayAttendances.filter((a) => a.checkOutTime).length;
    const todayAbsent = totalEmployees - todayPresent;

    // Department breakdown
    const deptMap = new Map<string, number>();
    todayAttendances.forEach((a) => {
      const dept = a.user.department || 'Other';
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });

    const result = {
      today: {
        date: today,
        totalEmployees,
        present: todayPresent,
        absent: todayAbsent,
        late: todayLate,
        checkedOut: todayCheckedOut,
        attendanceRate: Math.round((todayPresent / totalEmployees) * 100),
      },
      monthly: {
        thisMonth: monthlyAttendances,
        lastMonth: lastMonthAttendances,
        trend: lastMonthAttendances > 0
          ? Math.round(((monthlyAttendances - lastMonthAttendances) / lastMonthAttendances) * 100)
          : 0,
      },
      meta: {
        pendingLeaves,
        activeLocations: locationCount,
      },
      departmentBreakdown: Array.from(deptMap.entries()).map(([dept, count]) => ({
        department: dept,
        present: count,
        percentage: Math.round((count / totalEmployees) * 100),
      })),
    };

    await this.redis.setJson(cacheKey, result, 60); // 1 minute cache
    return result;
  }

  async getAttendanceTrend(companyId: string, days: number = 30) {
    const cacheKey = `dashboard:trend:${companyId}:${days}`;
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const startDate = dayjs().subtract(days - 1, 'day').startOf('day').toDate();
    const totalEmployees = await this.prisma.user.count({
      where: { companyId, isActive: true, role: { in: ['EMPLOYEE', 'SUPERVISOR'] } },
    });

    const attendances = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: { date: { gte: startDate }, user: { companyId } },
      _count: { id: true },
      orderBy: { date: 'asc' },
    });

    // Build daily data
    const dateMap = new Map<string, any>();
    for (let i = 0; i < days; i++) {
      const date = dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD');
      dateMap.set(date, {
        date,
        present: 0,
        late: 0,
        absent: totalEmployees,
        attendanceRate: 0,
      });
    }

    for (const record of attendances) {
      const dateKey = dayjs(record.date).format('YYYY-MM-DD');
      if (dateMap.has(dateKey)) {
        const day = dateMap.get(dateKey);
        if (record.status === AttendanceStatus.PRESENT) day.present += record._count.id;
        if (record.status === AttendanceStatus.LATE) {
          day.late += record._count.id;
          day.present += record._count.id;
        }
        day.absent = totalEmployees - day.present - day.late;
        day.attendanceRate = Math.round(((day.present + day.late) / totalEmployees) * 100);
      }
    }

    const result = Array.from(dateMap.values());
    await this.redis.setJson(cacheKey, result, 300); // 5 min cache
    return result;
  }

  async getLeaderboard(companyId: string, month?: string) {
    const targetMonth = month ? dayjs(month) : dayjs();
    const start = targetMonth.startOf('month').toDate();
    const end = targetMonth.endOf('month').toDate();

    const stats = await this.prisma.attendance.groupBy({
      by: ['userId'],
      where: {
        date: { gte: start, lte: end },
        user: { companyId },
      },
      _count: { id: true },
      _avg: { lateMinutes: true, workDuration: true },
      _sum: { overtimeMinutes: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const userIds = stats.map((s) => s.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, employeeId: true, department: true, avatarUrl: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return stats.map((stat, index) => ({
      rank: index + 1,
      user: userMap.get(stat.userId),
      totalPresent: stat._count.id,
      avgLateMinutes: Math.round(stat._avg.lateMinutes || 0),
      avgWorkHours: Math.round((stat._avg.workDuration || 0) / 60 * 10) / 10,
      totalOvertimeHours: Math.round((stat._sum.overtimeMinutes || 0) / 60 * 10) / 10,
    }));
  }
}

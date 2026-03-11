import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceStatus, LeaveStatus } from '@prisma/client';
import * as dayjs from 'dayjs';

@Injectable()
export class LeavesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: any) {
    const start = dayjs(dto.startDate);
    const end = dayjs(dto.endDate);

    if (!start.isValid() || !end.isValid()) {
      throw new BadRequestException('Format tanggal tidak valid');
    }

    if (end.isBefore(start)) throw new BadRequestException('Tanggal selesai harus setelah tanggal mulai');

    const totalDays = end.diff(start, 'day') + 1;

    return this.prisma.leaveRequest.create({
      data: {
        userId,
        type: dto.type,
        reason: dto.reason,
        attachment: dto.attachment,
        startDate: start.startOf('day').toDate(),
        endDate: end.startOf('day').toDate(),
        totalDays,
      },
      include: { user: { select: { fullName: true, employeeId: true } } },
    });
  }

  async findAll(companyId: string, filter: any) {
    const rawPage = Number(filter?.page ?? 1);
    const rawLimit = Number(filter?.limit ?? 20);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;
    const { status } = filter;
    const where: any = { user: { companyId } };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, employeeId: true, department: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  async findMy(userId: string, filter: any) {
    const rawPage = Number(filter?.page ?? 1);
    const rawLimit = Number(filter?.limit ?? 20);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;
    const { status } = filter;
    const where: any = { userId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, employeeId: true, department: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  async review(id: string, reviewerId: string, status: LeaveStatus, note?: string) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Pengajuan cuti tidak ditemukan');
    if (leave.status !== LeaveStatus.PENDING) throw new BadRequestException('Pengajuan ini sudah diproses');

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        reviewedBy: reviewerId,
        reviewNote: note,
        reviewedAt: new Date(),
      },
    });

    if (status === LeaveStatus.APPROVED) {
      const days = dayjs(leave.endDate).diff(dayjs(leave.startDate), 'day') + 1;
      const dates = Array.from({ length: days }, (_, i) =>
        dayjs(leave.startDate).add(i, 'day').toDate(),
      );

      await this.prisma.attendance.createMany({
        data: dates.map((date) => ({
          userId: leave.userId,
          date,
          status: AttendanceStatus.ON_LEAVE,
          isManualEntry: true,
          approvedBy: reviewerId,
          approvedAt: new Date(),
          adminNote: `Cuti: ${leave.type} - ${note || ''}`,
        })),
        skipDuplicates: true,
      });
    }

    return updated;
  }
}

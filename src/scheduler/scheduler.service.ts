// src/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AttendanceGateway } from '../gateway/attendance.gateway';
import { AttendanceStatus } from '@prisma/client';
import * as dayjs from 'dayjs';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private gateway: AttendanceGateway,
  ) {}

  /**
   * Auto-mark absent for employees who haven't checked in
   * Runs every day at 12:00 PM WIB
   */
  @Cron('0 12 * * 1-5', { timeZone: 'Asia/Jakarta' })
  async autoMarkAbsent() {
    this.logger.log('🕐 Running auto-absent job...');

    const today = dayjs().format('YYYY-MM-DD');
    const companies = await this.prisma.company.findMany({ where: { isActive: true } });

    for (const company of companies) {
      const policy = await this.prisma.attendancePolicy.findUnique({
        where: { companyId: company.id },
      });

      const employees = await this.prisma.user.findMany({
        where: {
          companyId: company.id,
          isActive: true,
          role: { in: ['EMPLOYEE', 'SUPERVISOR'] },
        },
      });

      const attendedUserIds = (
        await this.prisma.attendance.findMany({
          where: { date: new Date(today), user: { companyId: company.id } },
          select: { userId: true },
        })
      ).map((a) => a.userId);

      const absentUsers = employees.filter((e) => !attendedUserIds.includes(e.id));

      if (absentUsers.length > 0) {
        await this.prisma.attendance.createMany({
          data: absentUsers.map((user) => ({
            userId: user.id,
            date: new Date(today),
            status: AttendanceStatus.ABSENT,
            isCheckInValid: false,
            isCheckOutValid: false,
          })),
          skipDuplicates: true,
        });

        this.logger.log(
          `📋 Auto-absent: ${absentUsers.length} users in company ${company.name}`,
        );

        // Emit update
        await this.gateway.emitAttendanceUpdate(company.id, {
          type: 'AUTO_ABSENT',
          count: absentUsers.length,
          date: today,
        });
      }
    }
  }

  /**
   * Clear dashboard cache every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async clearDashboardCache() {
    await this.redis.flushPattern('dashboard:*');
    await this.redis.flushPattern('live:tracking:*');
  }

  /**
   * Heartbeat - log connected clients every 15 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async heartbeat() {
    const connected = this.gateway.getConnectedClientsCount();
    this.logger.log(`💓 Heartbeat | Connected WS clients: ${connected}`);
  }
}

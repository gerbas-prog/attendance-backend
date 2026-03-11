import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceStatus, Role } from '@prisma/client';
import * as dayjs from 'dayjs';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getMonthlySummary(companyId: string, year: number, month: number) {
    const start = dayjs(`${year}-${month}-01`).startOf('month').toDate();
    const end = dayjs(`${year}-${month}-01`).endOf('month').toDate();

    const users = await this.prisma.user.findMany({
      where: { companyId, isActive: true, role: { in: [Role.EMPLOYEE, Role.SUPERVISOR] } },
      include: {
        attendances: {
          where: { date: { gte: start, lte: end } },
        },
      },
    });

    return users.map((user) => {
      const { attendances } = user;
      const present = attendances.filter((a) => a.status === AttendanceStatus.PRESENT).length;
      const late = attendances.filter((a) => a.status === AttendanceStatus.LATE).length;
      const absent = attendances.filter((a) => a.status === AttendanceStatus.ABSENT).length;
      const onLeave = attendances.filter((a) => a.status === AttendanceStatus.ON_LEAVE).length;
      const totalWork = attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0);
      const totalOvertime = attendances.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);

      return {
        employeeId: user.employeeId,
        fullName: user.fullName,
        department: user.department,
        position: user.position,
        present,
        late,
        absent,
        onLeave,
        totalWorkHours: Math.round((totalWork / 60) * 10) / 10,
        totalOvertimeHours: Math.round((totalOvertime / 60) * 10) / 10,
        avgLateMinutes: Math.round(
          attendances.reduce((sum, a) => sum + (a.lateMinutes || 0), 0) / (attendances.length || 1),
        ),
        attendanceRate: Math.round(((present + late) / (present + late + absent || 1)) * 100),
      };
    });
  }

  async exportCsv(companyId: string, year: number, month: number): Promise<string> {
    const summary = await this.getMonthlySummary(companyId, year, month);

    const headers = [
      'Employee ID', 'Full Name', 'Department', 'Position',
      'Present', 'Late', 'Absent', 'On Leave',
      'Total Work Hours', 'Total Overtime Hours', 'Avg Late (min)', 'Attendance Rate (%)',
    ];

    const rows = summary.map((s) => [
      s.employeeId, s.fullName, s.department || '', s.position || '',
      s.present, s.late, s.absent, s.onLeave,
      s.totalWorkHours, s.totalOvertimeHours, s.avgLateMinutes, s.attendanceRate,
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }
}

// src/modules/reports/reports.controller.ts
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('monthly-summary')
  @ApiOperation({ summary: 'Get monthly attendance summary' })
  getMonthlySummary(
    @CurrentUser('companyId') companyId: string,
    @Query('year') year: number,
    @Query('month') month: number,
  ) {
    return this.reportsService.getMonthlySummary(companyId, year || new Date().getFullYear(), month || new Date().getMonth() + 1);
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export monthly attendance as CSV' })
  async exportCsv(
    @CurrentUser('companyId') companyId: string,
    @Query('year') year: number,
    @Query('month') month: number,
    @Res() res: Response,
  ) {
    const y = year || new Date().getFullYear();
    const m = month || new Date().getMonth() + 1;
    const csv = await this.reportsService.exportCsv(companyId, y, m);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${y}-${m}.csv"`);
    res.send(csv);
  }
}

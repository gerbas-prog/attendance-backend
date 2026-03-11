// src/modules/dashboard/dashboard.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get admin dashboard overview' })
  async getOverview(@CurrentUser('companyId') companyId: string) {
    return this.dashboardService.getAdminOverview(companyId);
  }

  @Get('trend')
  @ApiOperation({ summary: 'Get attendance trend chart data' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getTrend(
    @CurrentUser('companyId') companyId: string,
    @Query('days') days?: number,
  ) {
    return this.dashboardService.getAttendanceTrend(companyId, days);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get attendance leaderboard' })
  @ApiQuery({ name: 'month', required: false, example: '2024-01' })
  async getLeaderboard(
    @CurrentUser('companyId') companyId: string,
    @Query('month') month?: string,
  ) {
    return this.dashboardService.getLeaderboard(companyId, month);
  }
}

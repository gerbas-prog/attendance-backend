// src/modules/attendance/attendance.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { AttendanceFilterDto } from './dto/attendance-filter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Attendance')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in with GPS location validation' })
  async checkIn(
    @CurrentUser('id') userId: string,
    @Body() dto: CheckInDto,
  ) {
    return this.attendanceService.checkIn(userId, dto);
  }

  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-out with GPS location' })
  async checkOut(
    @CurrentUser('id') userId: string,
    @Body() dto: CheckOutDto,
  ) {
    return this.attendanceService.checkOut(userId, dto);
  }

  @Get('today')
  @ApiOperation({ summary: 'Get today attendance status' })
  async getTodayStatus(@CurrentUser('id') userId: string) {
    return this.attendanceService.getTodayStatus(userId);
  }

  @Get('my-history')
  @ApiOperation({ summary: 'Get my attendance history' })
  async getMyHistory(
    @CurrentUser('id') userId: string,
    @Query() filter: AttendanceFilterDto,
  ) {
    return this.attendanceService.getMyHistory(userId, filter);
  }

  // ADMIN ROUTES
  @Get('all')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '[Admin] Get all attendances' })
  async getAllAttendances(
    @CurrentUser('companyId') companyId: string,
    @Query() filter: AttendanceFilterDto,
  ) {
    return this.attendanceService.getAllAttendances(companyId, filter);
  }

  @Get('live-tracking')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '[Admin] Get real-time attendance tracking' })
  async getLiveTracking(@CurrentUser('companyId') companyId: string) {
    return this.attendanceService.getLiveTracking(companyId);
  }
}

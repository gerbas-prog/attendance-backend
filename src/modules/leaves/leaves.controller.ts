// src/modules/leaves/leaves.controller.ts
import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LeavesService } from './leaves.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, LeaveStatus } from '@prisma/client';

@ApiTags('Leaves')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leaves')
export class LeavesController {
  constructor(private leavesService: LeavesService) {}

  @Post()
  @ApiOperation({ summary: 'Submit leave request' })
  create(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.leavesService.create(userId, dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '[Admin] Get all leave requests' })
  findAll(@CurrentUser('companyId') companyId: string, @Query() filter: any) {
    return this.leavesService.findAll(companyId, filter);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my leave requests' })
  findMy(@CurrentUser('id') userId: string, @Query() filter: any) {
    return this.leavesService.findMy(userId, filter);
  }

  @Patch(':id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '[Admin] Approve leave request' })
  approve(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body('note') note?: string,
  ) {
    return this.leavesService.review(id, reviewerId, LeaveStatus.APPROVED, note);
  }

  @Patch(':id/reject')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '[Admin] Reject leave request' })
  reject(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body('note') note?: string,
  ) {
    return this.leavesService.review(id, reviewerId, LeaveStatus.REJECTED, note);
  }
}

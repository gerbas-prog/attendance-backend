// src/modules/users/users.controller.ts
import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new employee' })
  create(@CurrentUser('companyId') companyId: string, @Body() dto: any) {
    return this.usersService.create(companyId, dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'List all employees' })
  findAll(@CurrentUser('companyId') companyId: string, @Query() filter: any) {
    return this.usersService.findAll(companyId, filter);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Get employee detail' })
  findOne(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.usersService.findOne(id, companyId);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update employee' })
  update(@Param('id') id: string, @CurrentUser('companyId') companyId: string, @Body() dto: any) {
    return this.usersService.update(id, companyId, dto);
  }

  @Patch(':id/toggle-active')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Toggle employee active status' })
  toggleActive(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.usersService.toggleActive(id, companyId);
  }
}

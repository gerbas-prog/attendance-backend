// src/modules/location/location.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LocationService } from './location.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Location')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('locations')
export class LocationController {
  constructor(private locationService: LocationService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create new geofence location' })
  create(@CurrentUser('companyId') companyId: string, @Body() dto: CreateLocationDto) {
    return this.locationService.create(companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all company locations' })
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.locationService.findAll(companyId);
  }

  @Get('check-range')
  @ApiOperation({ summary: 'Check if current GPS is within any assigned location' })
  checkRange(
    @CurrentUser('id') userId: string,
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('accuracy') accuracy?: number,
  ) {
    return this.locationService.checkUserInRange(userId, lat, lng, accuracy);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get location detail' })
  findOne(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.locationService.findOne(id, companyId);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update location' })
  update(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationService.update(id, companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate location' })
  remove(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.locationService.remove(id, companyId);
  }
}

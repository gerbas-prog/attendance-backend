// src/modules/location/location.module.ts
import { Module } from '@nestjs/common';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { GeofenceUtil } from '../../common/utils/geofence.util';

@Module({
  controllers: [LocationController],
  providers: [LocationService, GeofenceUtil],
  exports: [LocationService],
})
export class LocationModule {}

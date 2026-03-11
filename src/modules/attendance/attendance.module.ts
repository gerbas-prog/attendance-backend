// src/modules/attendance/attendance.module.ts
import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { GeofenceUtil } from '../../common/utils/geofence.util';
import { GatewayModule } from '../../gateway/gateway.module';

@Module({
  imports: [GatewayModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, GeofenceUtil],
  exports: [AttendanceService],
})
export class AttendanceModule {}

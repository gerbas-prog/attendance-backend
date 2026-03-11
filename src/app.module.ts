// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LocationModule } from './modules/location/location.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { GatewayModule } from './gateway/gateway.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('THROTTLE_TTL', 60) * 1000,
          limit: config.get('THROTTLE_LIMIT', 100),
        },
      ],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Core modules
    PrismaModule,
    RedisModule,
    GatewayModule,
    SchedulerModule,

    // Feature modules
    AuthModule,
    UsersModule,
    AttendanceModule,
    LocationModule,
    DashboardModule,
    LeavesModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

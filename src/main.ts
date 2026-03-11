// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const host = config.get<string>('HOST', '0.0.0.0');
  const appUrl = config.get<string>('APP_URL', `http://localhost:${port}`);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000');

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      const isPrivateLan = /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(origin);

      if (origin === frontendUrl || isLocalhost || isPrivateLan) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor());

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Attendance System API')
      .setDescription('Smart GPS-based Field Worker Attendance System')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .addTag('Auth', 'Authentication & Authorization')
      .addTag('Attendance', 'Attendance Check-in/Check-out')
      .addTag('Location', 'Geofencing Location Management')
      .addTag('Users', 'User Management')
      .addTag('Dashboard', 'Admin Dashboard & Analytics')
      .addTag('Leaves', 'Leave Request Management')
      .addTag('Reports', 'Attendance Reports')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port, host);

  const logger = new Logger('Bootstrap');
  logger.log(`API running on: ${appUrl}/api/v1`);
  logger.log(`Swagger docs: ${appUrl}/api/docs`);
  logger.log(`Environment: ${nodeEnv}`);
}

bootstrap();
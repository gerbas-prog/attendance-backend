// src/modules/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from '@prisma/client';

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: string;
  companyId: string;
  employeeId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user) throw new UnauthorizedException('Email atau password salah');
    if (!user.isActive) throw new ForbiddenException('Akun Anda telah dinonaktifkan');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Email atau password salah');

    return user;
  }

  async login(dto: LoginDto, ip: string, userAgent: string): Promise<{
    user: any;
    tokens: TokenPair;
  }> {
    const user = await this.validateUser(dto.email, dto.password);

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log activity
    await this.logActivity(user.id, 'LOGIN', 'auth', { ip, userAgent });

    const { password: _, refreshToken: __, ...safeUser } = user;
    return { user: safeUser, tokens };
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new ForbiddenException('Access denied');

    // Validate refresh token from Redis
    const storedToken = await this.redis.get(`refresh:${userId}`);
    if (!storedToken) throw new ForbiddenException('Session expired, please login again');

    const isMatch = await bcrypt.compare(refreshToken, storedToken);
    if (!isMatch) throw new ForbiddenException('Invalid refresh token');

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(userId, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.redis.del(`refresh:${userId}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    await this.logActivity(userId, 'LOGOUT', 'auth');
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) throw new BadRequestException('Password lama tidak sesuai');

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Konfirmasi password tidak cocok');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    // Invalidate all sessions
    await this.redis.del(`refresh:${userId}`);
    await this.logActivity(userId, 'CHANGE_PASSWORD', 'auth');
  }

  async getMe(userId: string): Promise<any> {
    const cacheKey = `user:profile:${userId}`;
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: { select: { id: true, name: true, code: true, timezone: true } },
        shift: true,
        locations: { include: { location: true } },
        supervisor: { select: { id: true, fullName: true, email: true } },
      },
    });

    const { password, refreshToken, ...safeUser } = user;
    await this.redis.setJson(cacheKey, safeUser, 300); // cache 5 minutes
    return safeUser;
  }

  private async generateTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      employeeId: user.employeeId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwt.signAsync(
        { sub: user.id },
        {
          secret: this.config.get('JWT_REFRESH_SECRET'),
          expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        },
      ),
    ]);

    return { accessToken, refreshToken, expiresIn: 900 }; // 15 minutes in seconds
  }

  private async saveRefreshToken(userId: string, token: string): Promise<void> {
    const hashed = await bcrypt.hash(token, 10);
    const ttl = 7 * 24 * 60 * 60; // 7 days
    await this.redis.set(`refresh:${userId}`, hashed, ttl);
  }

  private async logActivity(userId: string, action: string, module: string, details?: any) {
    await this.prisma.activityLog.create({
      data: { userId, action, module, details },
    }).catch((e) => this.logger.warn('Failed to log activity:', e.message));
  }
}

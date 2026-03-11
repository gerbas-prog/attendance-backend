// src/modules/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async create(companyId: string, dto: any) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { employeeId: dto.employeeId }] },
    });
    if (exists) throw new ConflictException('Email atau Employee ID sudah digunakan');

    const hashedPassword = await bcrypt.hash(dto.password || 'Employee@123', 12);

    const user = await this.prisma.user.create({
      data: { ...dto, companyId, password: hashedPassword },
      select: { id: true, fullName: true, email: true, employeeId: true, role: true, createdAt: true },
    });

    // Assign to locations if provided
    if (dto.locationIds?.length) {
      await this.prisma.userLocation.createMany({
        data: dto.locationIds.map((locationId: string) => ({ userId: user.id, locationId })),
        skipDuplicates: true,
      });
    }

    return user;
  }

  async findAll(companyId: string, filter: any) {
    const { page = 1, limit = 20, search, role, department, isActive } = filter;

    const where: any = { companyId };
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (department) where.department = department;
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, fullName: true, email: true, employeeId: true,
          role: true, department: true, position: true, isActive: true,
          avatarUrl: true, lastLoginAt: true, createdAt: true,
          shift: { select: { name: true, startTime: true, endTime: true } },
          locations: { include: { location: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      include: {
        shift: true,
        locations: { include: { location: true } },
        supervisor: { select: { id: true, fullName: true, email: true } },
        _count: { select: { attendances: true, leaveRequests: true } },
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    const { password, refreshToken, ...safe } = user;
    return safe;
  }

  async update(id: string, companyId: string, dto: any) {
    await this.findOne(id, companyId);
    const { locationIds, password, ...updateData } = dto;

    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, fullName: true, email: true, employeeId: true, role: true, updatedAt: true },
    });

    // Update locations
    if (locationIds) {
      await this.prisma.userLocation.deleteMany({ where: { userId: id } });
      if (locationIds.length) {
        await this.prisma.userLocation.createMany({
          data: locationIds.map((locationId: string) => ({ userId: id, locationId })),
        });
      }
    }

    // Clear cache
    await this.redis.del(`user:profile:${id}`);
    return user;
  }

  async toggleActive(id: string, companyId: string) {
    const user = await this.findOne(id, companyId);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true, fullName: true },
    });
    await this.redis.del(`user:profile:${id}`);
    return updated;
  }
}

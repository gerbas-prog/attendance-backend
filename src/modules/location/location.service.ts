import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { GeofenceUtil } from '../../common/utils/geofence.util';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private geofence: GeofenceUtil,
  ) {}

  async create(companyId: string, dto: CreateLocationDto) {
    const location = await this.prisma.location.create({
      data: { ...dto, companyId },
    });
    await this.redis.flushPattern(`locations:${companyId}*`);
    return location;
  }

  async findAll(companyId: string) {
    const cacheKey = `locations:${companyId}:all`;
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const locations = await this.prisma.location.findMany({
      where: { companyId },
      include: {
        _count: { select: { assignments: true, attendances: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.redis.setJson(cacheKey, locations, 300);
    return locations;
  }

  async findOne(id: string, companyId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, companyId },
      include: {
        assignments: {
          include: { user: { select: { id: true, fullName: true, employeeId: true } } },
        },
      },
    });
    if (!location) throw new NotFoundException('Lokasi tidak ditemukan');
    return location;
  }

  async update(id: string, companyId: string, dto: UpdateLocationDto) {
    await this.findOne(id, companyId);
    const updated = await this.prisma.location.update({
      where: { id },
      data: dto,
    });
    await this.redis.flushPattern(`locations:${companyId}*`);
    return updated;
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.location.update({
      where: { id },
      data: { isActive: false },
    });
    await this.redis.flushPattern(`locations:${companyId}*`);
    return { message: 'Lokasi berhasil dinonaktifkan' };
  }

  async checkUserInRange(
    userId: string,
    latitude: number,
    longitude: number,
    accuracy?: number,
  ) {
    const userLocations = await this.prisma.userLocation.findMany({
      where: { userId },
      include: { location: true },
    });

    const locations = userLocations
      .map((ul) => ul.location)
      .filter((location) => location && location.isActive);

    if (!locations.length) return { isInRange: false, nearest: null, message: 'Tidak ada lokasi ditugaskan' };

    const nearest = this.geofence.findNearestLocation({ latitude, longitude }, locations);
    if (!nearest) return { isInRange: false, nearest: null, message: 'Tidak ada lokasi valid ditemukan' };

    return {
      isInRange: nearest.isInside,
      nearest: {
        ...nearest.location,
        distance: nearest.distance,
      },
      message: nearest.isInside
        ? `Anda berada dalam radius lokasi "${nearest.location.name}"`
        : `Anda ${nearest.distance}m dari lokasi terdekat "${nearest.location.name}"`,
    };
  }
}

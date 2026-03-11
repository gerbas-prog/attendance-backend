// src/redis/redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private redisEnabled = true;
  private memoryStore = new Map<string, { value: string; expiresAt?: number }>();
  private readonly logger = new Logger(RedisService.name);

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.redisEnabled = this.config.get<string>('REDIS_ENABLED', 'true') !== 'false';
    if (!this.redisEnabled) {
      this.logger.warn('Redis disabled via REDIS_ENABLED=false, using in-memory fallback');
      return;
    }

    const client = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD') || undefined,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    client.on('connect', () => this.logger.log('Redis connected'));
    client.on('error', (err) => {
      this.logger.warn(`Redis unavailable (${err?.message || 'unknown error'}), using in-memory fallback`);
      this.redisEnabled = false;
      if (this.client) void this.client.disconnect();
      this.client = null;
    });

    this.client = client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  private now(): number {
    return Date.now();
  }

  private isExpired(entry?: { value: string; expiresAt?: number }): boolean {
    return !!entry?.expiresAt && entry.expiresAt <= this.now();
  }

  private fallbackGet(key: string): string | null {
    const entry = this.memoryStore.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  private fallbackSet(key: string, value: string, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds ? this.now() + ttlSeconds * 1000 : undefined;
    this.memoryStore.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    if (!this.redisEnabled || !this.client) {
      return this.fallbackGet(key);
    }
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.redisEnabled || !this.client) {
      this.fallbackSet(key, value, ttlSeconds);
      return;
    }

    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    if (!this.redisEnabled || !this.client) {
      keys.forEach((k) => this.memoryStore.delete(k));
      return;
    }
    await this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.redisEnabled || !this.client) {
      return this.fallbackGet(key) !== null;
    }
    return (await this.client.exists(key)) === 1;
  }

  async setJson<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(data), ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const data = await this.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  }

  async incr(key: string): Promise<number> {
    if (!this.redisEnabled || !this.client) {
      const current = Number(this.fallbackGet(key) || '0') + 1;
      this.fallbackSet(key, String(current));
      return current;
    }
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.redisEnabled || !this.client) {
      const value = this.fallbackGet(key);
      if (value !== null) this.fallbackSet(key, value, seconds);
      return;
    }
    await this.client.expire(key, seconds);
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.redisEnabled || !this.client) {
      if (pattern === '*') return [...this.memoryStore.keys()];
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      return [...this.memoryStore.keys()].filter((key) => regex.test(key));
    }
    return this.client.keys(pattern);
  }

  async flushPattern(pattern: string): Promise<void> {
    const keys = await this.keys(pattern);
    if (keys.length) await this.del(keys);
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.redisEnabled || !this.client) return;
    await this.client.publish(channel, message);
  }

  getClient(): Redis {
    return this.client as Redis;
  }
}

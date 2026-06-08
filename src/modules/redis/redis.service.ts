import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: IORedis | null = null;
  private connectPromise: Promise<void> | null = null;
  private available = false;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private async connect(): Promise<void> {
    if (this.client) return;
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL not configured — Redis disabled');
      return;
    }
    const client = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    try {
      await client.connect();
      this.client = client;
      this.available = true;
      this.logger.log('Redis connected');
    } catch (err) {
      this.logger.warn(`Redis unavailable: ${err instanceof Error ? err.message : String(err)}`);
      client.disconnect();
    }
  }

  private async getClient(): Promise<IORedis | null> {
    if (!this.connectPromise) {
      this.connectPromise = this.connect();
    }
    await this.connectPromise;
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      if (!client) return null;
      return await client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      const client = await this.getClient();
      if (!client) return;
      await client.set(key, value, 'EX', ttlSeconds);
    } catch {
      // graceful degradation
    }
  }

  async del(key: string): Promise<void> {
    try {
      const client = await this.getClient();
      if (!client) return;
      await client.del(key);
    } catch {
      // graceful degradation
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const client = await this.getClient();
      if (!client) return { ok: false, latencyMs: 0 };
      await client.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}

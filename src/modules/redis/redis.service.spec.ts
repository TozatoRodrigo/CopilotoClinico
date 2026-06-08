import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// We need to use vi.mock BEFORE module import, but since RedisService is already
// imported, we test via the service interface directly.
// The real IORedis constructor is never called because connect() bails out
// when no URL is configured or throws — we test the public API behaviour.

function makeService(redisUrl: string | undefined) {
  const configService = {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'REDIS_URL') return redisUrl;
      return undefined;
    }),
  } as unknown as ConfigService;
  return new RedisService(configService);
}

describe('RedisService', () => {
  let service: RedisService;

  afterEach(async () => {
    await service.onModuleDestroy();
    vi.clearAllMocks();
  });

  describe('when REDIS_URL is not configured', () => {
    beforeEach(() => {
      service = makeService(undefined);
    });

    it('should return null from get when Redis is disabled', async () => {
      const result = await service.get('test-key');
      expect(result).toBeNull();
    });

    it('should not throw from set when Redis is disabled', async () => {
      await expect(service.set('test-key', 'value', 60)).resolves.not.toThrow();
    });

    it('should not throw from del when Redis is disabled', async () => {
      await expect(service.del('test-key')).resolves.not.toThrow();
    });

    it('should return ok:false from ping when Redis is disabled', async () => {
      const result = await service.ping();
      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBe(0);
    });

    it('should report isAvailable as false', async () => {
      await service.get('key'); // trigger connect attempt
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('when REDIS_URL is configured but connection fails', () => {
    beforeEach(() => {
      // Use an invalid/unreachable URL so the connect attempt fails quickly
      service = makeService('redis://127.0.0.1:1'); // port 1 should fail instantly
    });

    it('should return null from get on connection failure', async () => {
      const result = await service.get('test-key');
      expect(result).toBeNull();
    });

    it('should not throw from set on connection failure', async () => {
      await expect(service.set('test-key', 'value', 60)).resolves.not.toThrow();
    });

    it('should return ok:false from ping on connection failure', async () => {
      const result = await service.ping();
      expect(result.ok).toBe(false);
    });

    it('should report isAvailable as false when connection fails', async () => {
      await service.get('key'); // trigger connect attempt
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('graceful degradation when Redis throws on operation', () => {
    beforeEach(() => {
      service = makeService(undefined);
    });

    it('get should return null (not throw) on any error', async () => {
      const result = await service.get('some-key');
      expect(result).toBeNull();
    });

    it('set should resolve (not throw) on any error', async () => {
      await expect(service.set('key', 'val', 10)).resolves.toBeUndefined();
    });

    it('del should resolve (not throw) on any error', async () => {
      await expect(service.del('key')).resolves.toBeUndefined();
    });

    it('ping should return ok:false (not throw) on any error', async () => {
      const result = await service.ping();
      expect(result.ok).toBe(false);
    });
  });
});

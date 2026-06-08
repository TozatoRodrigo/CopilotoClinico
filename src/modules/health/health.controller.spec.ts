import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthController } from './health.controller';

const mockPrisma = { $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]) };
const mockConfig = { get: vi.fn() };

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new HealthController(mockPrisma as never, mockConfig as never);
  });

  it('returns status ok when all dependencies healthy', async () => {
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'AI_PROVIDER') return 'openai';
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      return undefined;
    });
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.dependencies.database.status).toBe('ok');
    expect(result.dependencies.ai.status).toBe('ok');
  });

  it('returns degraded when AI_PROVIDER not configured', async () => {
    mockConfig.get.mockReturnValue(undefined);
    const result = await controller.check();
    expect(result.status).toBe('degraded');
    expect(result.dependencies.ai.status).toBe('degraded');
  });

  it('returns a valid ISO timestamp', async () => {
    mockConfig.get.mockReturnValue(undefined);
    const result = await controller.check();
    expect(result).toHaveProperty('timestamp');
    const parsed = new Date(result.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('throws 503 when database is unavailable', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    mockConfig.get.mockReturnValue(undefined);
    await expect(controller.check()).rejects.toMatchObject({ statusCode: 503 });
  });
});

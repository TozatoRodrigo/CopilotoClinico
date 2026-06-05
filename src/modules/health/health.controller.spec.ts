import { describe, it, expect, beforeEach } from 'vitest';
import { HealthController } from './health.controller';
import { PrismaService } from '../../config/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: () => Promise<unknown> };

  beforeEach(() => {
    prisma = { $queryRaw: () => Promise.resolve([{ '?column?': 1 }]) };
    controller = new HealthController(prisma as unknown as PrismaService);
  });

  it('returns status ok', () => {
    const result = controller.check();
    expect(result).toHaveProperty('status', 'ok');
  });

  it('returns a valid ISO timestamp', () => {
    const result = controller.check();
    expect(result).toHaveProperty('timestamp');
    const parsed = new Date(result.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('returns ready when database responds', async () => {
    const result = await controller.ready();
    expect(result).toHaveProperty('status', 'ready');
  });
});

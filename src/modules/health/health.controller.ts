import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

type DependencyStatus = 'ok' | 'degraded' | 'unavailable';

interface HealthDependency {
  status: DependencyStatus;
  latencyMs?: number;
  reason?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  dependencies: {
    database: HealthDependency;
    ai: HealthDependency;
    redis: HealthDependency;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();

    const [db, ai, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkAi(),
      this.checkRedis(),
    ]);

    const isDown = db.status === 'unavailable';
    const isDegraded = !isDown && (ai.status !== 'ok' || redis.status === 'degraded');
    const overallStatus = isDown ? 'down' : isDegraded ? 'degraded' : 'ok';

    const response: HealthResponse = {
      status: overallStatus,
      timestamp,
      dependencies: { database: db, ai, redis },
    };

    if (isDown) {
      throw Object.assign(new Error('Service unavailable'), {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        response,
      });
    }

    return response;
  }

  private async checkDatabase(): Promise<HealthDependency> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'unavailable',
        latencyMs: Date.now() - start,
        reason: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private checkAi(): HealthDependency {
    const provider = this.config.get<string>('AI_PROVIDER');
    if (!provider) {
      return { status: 'degraded', reason: 'AI_PROVIDER not configured' };
    }
    return { status: 'ok' };
  }

  private checkRedis(): HealthDependency {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      return { status: 'unavailable', reason: 'REDIS_URL not configured' };
    }
    return { status: 'ok' };
  }
}

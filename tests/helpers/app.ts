import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/config/prisma.service';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-characters-long!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-characters-long!!';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? 'openai';
process.env.AI_API_KEY = process.env.AI_API_KEY ?? 'test-key';
process.env.AI_MODEL = process.env.AI_MODEL ?? 'test-model';
process.env.AI_EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? 'test-embedding-model';

export async function buildApp(): Promise<NestFastifyApplication> {
  const { AppModule } = await import('../../src/app.module');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      $connect: () => Promise.resolve(),
      $disconnect: () => Promise.resolve(),
      $queryRaw: () => Promise.resolve([{ ok: 1 }]),
    })
    .overrideProvider(AiGatewayService)
    .useValue({
      complete: () => Promise.resolve({ content: '', model: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 0 }),
      embed: () => Promise.resolve({ embeddings: [], model: '', usage: { promptTokens: 0, totalTokens: 0 } }),
      getProviderName: () => 'mock',
    })
    .compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  app.setGlobalPrefix('v1');

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/config/prisma.service';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { InferenceQueueService } from '../../src/modules/queue/inference-queue.service';
import { InferenceWorkerService } from '../../src/modules/queue/inference-worker.service';
import { WhisperService } from '../../src/modules/audio/whisper.service';

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-characters-long!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-characters-long!!';
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export async function buildApp(): Promise<NestFastifyApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      $connect: () => Promise.resolve(),
      $disconnect: () => Promise.resolve(),
      $queryRaw: () => Promise.resolve([{ 1: 1 }]),
    })
    .overrideProvider(AiGatewayService)
    .useValue({
      complete: () => Promise.resolve({ content: '', model: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 0 }),
      embed: () => Promise.resolve({ embeddings: [], model: '', usage: { promptTokens: 0, totalTokens: 0 } }),
      getProviderName: () => 'mock',
    })
    .overrideProvider(InferenceQueueService)
    .useValue({
      enqueueAnalyze: () => Promise.resolve('mock-job-id'),
      enqueueTranscribe: () => Promise.resolve('mock-job-id'),
      getJobStatus: () => Promise.resolve({ jobId: 'mock-job-id', status: 'unknown', progress: 0 }),
      getQueue: () => ({}),
      onModuleInit: () => undefined,
      onModuleDestroy: () => Promise.resolve(),
    })
    .overrideProvider(InferenceWorkerService)
    .useValue({
      onModuleInit: () => undefined,
      onModuleDestroy: () => Promise.resolve(),
    })
    .overrideProvider(WhisperService)
    .useValue({
      transcribe: () => Promise.resolve('mock transcript'),
      onModuleInit: () => undefined,
    })
    .compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  app.setGlobalPrefix('v1');

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

import { HttpException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { OrchestratorService } from '../copilot/orchestrator/orchestrator.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LgpdService } from '../lgpd/lgpd.service';
import { maskPII } from '../copilot/guardrails/pii-filter';
import {
  INFERENCE_QUEUE,
  type InferenceJobData,
  type InferenceJobResult,
  type AnalyzeJobData,
  type TranscribeJobData,
} from './inference-queue.types';
import { InferenceQueueService } from './inference-queue.service';

const DEFAULT_CONCURRENCY = 2;

/**
 * Recusa do pedido (4xx: consentimento revogado, atendimento de outro médico,
 * injeção) não muda numa nova tentativa: o job falha na hora, sem retry e sem
 * nova chamada de IA. A mensagem da recusa não leva texto clínico.
 */
function failFastOnRefusal(error: unknown): never {
  if (error instanceof HttpException && error.getStatus() < 500) {
    throw new UnrecoverableError(error.message);
  }
  throw error;
}

@Injectable()
export class InferenceWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InferenceWorkerService.name);
  private worker!: Worker<InferenceJobData, InferenceJobResult>;
  private connection!: IORedis;

  constructor(
    private readonly config: ConfigService,
    private readonly orchestrator: OrchestratorService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: InferenceQueueService,
    private readonly lgpd: LgpdService,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.getOrThrow<string>('REDIS_URL');
    // ConfigService retorna strings mesmo com o generic <number>; BullMQ exige
    // number finito > 0 (senão: "concurrency must be a finite number greater than 0").
    const concurrency =
      Number(this.config.get<string>('INFERENCE_QUEUE_CONCURRENCY', String(DEFAULT_CONCURRENCY))) ||
      DEFAULT_CONCURRENCY;
    const rateLimit = Number(this.config.get<string>('INFERENCE_QUEUE_RATE_PER_SEC', '10')) || 10;

    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker<InferenceJobData, InferenceJobResult>(
      INFERENCE_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.connection,
        concurrency,
        limiter: { max: rateLimit, duration: 1000 },
      },
    );

    this.worker.on('completed', (job) => this.logger.log(`Job ${job.id} (${job.name}) completed`));
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`),
    );

    this.logger.log(`Inference worker started — concurrency=${concurrency}, rate=${rateLimit}/s`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    this.connection.disconnect();
  }

  private async process(
    job: Job<InferenceJobData, InferenceJobResult>,
  ): Promise<InferenceJobResult> {
    try {
      if (job.data.type === 'analyze') {
        return await this.processAnalyze(job as Job<AnalyzeJobData>);
      }
      return await this.processTranscribe(job as Job<TranscribeJobData>);
    } catch (error) {
      return failFastOnRefusal(error);
    }
  }

  private async processAnalyze(job: Job<AnalyzeJobData>): Promise<InferenceJobResult> {
    const { physicianId, encounterId, input } = job.data;
    // CC-010 — o médico pode revogar o consentimento entre o pedido (que já
    // passou pelo AiConsentGuard) e a vez do job na fila.
    await this.lgpd.assertAiProcessingAllowed(physicianId);
    await job.updateProgress(10);
    const result = await this.orchestrator.analyze(physicianId, encounterId, input);
    await job.updateProgress(100);
    return { type: 'analyze', ...result };
  }

  private async processTranscribe(job: Job<TranscribeJobData>): Promise<InferenceJobResult> {
    const { audioId, physicianId, encounterId } = job.data;

    await job.updateProgress(10);

    const audio = await this.prisma.audioCapture.findUniqueOrThrow({ where: { id: audioId } });

    await this.prisma.audioCapture.update({
      where: { id: audioId },
      data: { status: 'transcribing' },
    });

    await job.updateProgress(20);

    // Whisper transcription is done by AudioService — import lazily to avoid circular dep
    // The worker receives the transcription via a separate call from AudioService after upload.
    // Here we only handle the post-transcription analyze step.
    const transcript = audio.transcribedText;
    if (!transcript) {
      throw new Error(
        `AudioCapture ${audioId} has no transcribedText — transcription must run before this job`,
      );
    }

    await job.updateProgress(60);

    // Feed transcript through full analyze pipeline
    const piiFiltered = maskPII(transcript);
    const analyzeJobId = await this.queue.enqueueAnalyze({
      physicianId,
      encounterId,
      input: {
        caseText: piiFiltered.redacted,
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
        // S20-CLIN-01 — redFlags obrigatório no tipo AnalyzeInput (default {}).
        redFlags: {},
      },
    });

    await this.prisma.audioCapture.update({
      where: { id: audioId },
      data: { status: 'completed' },
    });

    await this.audit.log({
      actorId: physicianId,
      action: 'AUDIO_PIPELINE_QUEUED',
      entity: 'AudioCapture',
      entityId: audioId,
      payload: { analyzeJobId, piiDetected: piiFiltered.hasPII },
    });

    await job.updateProgress(100);

    return { type: 'transcribe', audioId, transcript, analyzeJobId };
  }
}

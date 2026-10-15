import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ConversationService } from '../copilot/intake/conversation.service';
import { IntakeService } from '../copilot/intake/intake.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LgpdService } from '../lgpd/lgpd.service';
import {
  INFERENCE_QUEUE,
  type AnalyzeJobResult,
  type InferenceJobResult,
  type StoredAnalyzeJobData,
  type StoredInferenceJobData,
  type TranscribeJobData,
  type TranscribeJobResult,
} from './inference-queue.types';
import { InferenceQueueService } from './inference-queue.service';

const DEFAULT_CONCURRENCY = 2;

/**
 * Recusa do pedido (4xx: consentimento revogado, atendimento de outro médico,
 * injeção, plano já feito) não muda numa nova tentativa: o job falha na hora,
 * sem retry e sem nova chamada de IA. A mensagem da recusa não leva texto
 * clínico.
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
  private worker!: Worker<StoredInferenceJobData, InferenceJobResult>;
  private connection!: IORedis;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(IntakeService) private readonly intakes: IntakeService,
    @Inject(ConversationService) private readonly conversation: ConversationService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(InferenceQueueService) private readonly queue: InferenceQueueService,
    @Inject(LgpdService) private readonly lgpd: LgpdService,
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

    this.worker = new Worker<StoredInferenceJobData, InferenceJobResult>(
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
    job: Job<StoredInferenceJobData, InferenceJobResult>,
  ): Promise<InferenceJobResult> {
    try {
      if (job.data.type === 'analyze') {
        return await this.processAnalyze(job, job.data);
      }
      return await this.processTranscribe(job, job.data);
    } catch (error) {
      return failFastOnRefusal(error);
    }
  }

  /**
   * CC-011 — o caso vem da conversa no banco, já redigido, pelo mesmo caminho
   * do plano sem streaming da tela (`ConversationService.analyze`): uma
   * conversa gera um plano só, e a tela mostra o plano quando ele sai.
   */
  private async processAnalyze(
    job: Job<StoredInferenceJobData>,
    data: StoredAnalyzeJobData,
  ): Promise<AnalyzeJobResult> {
    const { physicianId, encounterId } = data;
    const intakeId = await this.intakeIdOf(job, data);
    // CC-010 — o médico pode revogar o consentimento entre o pedido (que já
    // passou pelo AiConsentGuard) e a vez do job na fila.
    await this.lgpd.assertAiProcessingAllowed(physicianId);
    await job.updateProgress(10);
    const result = await this.conversation.analyze(physicianId, encounterId, intakeId);
    await job.updateProgress(100);
    return { type: 'analyze', intakeId, interactionId: result.interactionId };
  }

  /**
   * Job enfileirado antes do CC-011 leva o pedido com o caso sem redação. O
   * texto sai do Redis antes de tudo; depois o caso vira uma conversa no
   * banco, como um pedido novo, e o job passa a levar só o id dela. Se a
   * conversa não abrir (injeção, caso encerrado), o job falha sem o texto.
   * Pode sair quando nenhum job anterior ao deploy restar (7 dias).
   */
  private async intakeIdOf(
    job: Job<StoredInferenceJobData>,
    data: StoredAnalyzeJobData,
  ): Promise<string> {
    if ('intakeId' in data) return data.intakeId;
    // Job antigo cuja tentativa anterior já tirou o texto e falhou antes de
    // abrir a conversa: não há o que analisar.
    if (!('input' in data)) {
      throw new UnrecoverableError(
        'Pedido feito antes da atualização da fila não pôde ser refeito: peça a análise de novo',
      );
    }

    const { input, ...ids } = data;
    this.logger.warn(`INFERENCE_LEGACY_JOB jobId=${job.id}: texto do caso tirado do Redis`);
    await job.updateData(ids);
    const intake = await this.intakes.openForQueue(ids.physicianId, ids.encounterId, input);
    await job.updateData({ ...ids, intakeId: intake.id });
    return intake.id;
  }

  /**
   * O áudio já foi transcrito e mascarado no upload (`AudioService`); aqui a
   * transcrição vira uma conversa e entra na fila de análise só pelo id.
   */
  private async processTranscribe(
    job: Job<StoredInferenceJobData>,
    data: TranscribeJobData,
  ): Promise<TranscribeJobResult> {
    const { audioId, physicianId, encounterId } = data;

    await job.updateProgress(10);

    const audio = await this.prisma.audioCapture.findUniqueOrThrow({ where: { id: audioId } });

    await this.prisma.audioCapture.update({
      where: { id: audioId },
      data: { status: 'transcribing' },
    });

    await job.updateProgress(20);

    const transcript = audio.transcribedText;
    if (!transcript) {
      throw new Error(
        `AudioCapture ${audioId} has no transcribedText — transcription must run before this job`,
      );
    }

    await job.updateProgress(60);

    const intake = await this.intakes.openForQueue(physicianId, encounterId, {
      caseText: transcript,
      context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      // S20-CLIN-01 — redFlags obrigatório no tipo AnalyzeInput (default {}).
      redFlags: {},
    });
    const analyzeJobId = await this.queue.enqueueAnalyze({
      physicianId,
      encounterId,
      intakeId: intake.id,
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
      payload: { analyzeJobId, intakeId: intake.id, piiDetected: intake.piiDetected },
    });

    await job.updateProgress(100);

    return { type: 'transcribe', audioId, analyzeJobId };
  }
}

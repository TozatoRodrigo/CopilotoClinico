import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  INFERENCE_QUEUE,
  type AnalyzeJobData,
  type TranscribeJobData,
  type InferenceJobData,
  type InferenceJobResult,
  type JobStatus,
} from './inference-queue.types';

@Injectable()
export class InferenceQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InferenceQueueService.name);
  private queue!: Queue<InferenceJobData, InferenceJobResult>;
  private connection!: IORedis;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.getOrThrow<string>('REDIS_URL');
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<InferenceJobData, InferenceJobResult>(INFERENCE_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 }, // keep 24h
        removeOnFail: { age: 86400 * 7 }, // keep failed 7d for debugging
      },
    });
    this.logger.log(`Inference queue ready (Redis: ${redisUrl})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }

  async enqueueAnalyze(data: Omit<AnalyzeJobData, 'type'>): Promise<string> {
    const job = await this.queue.add('analyze', { type: 'analyze', ...data });
    this.logger.debug(`Enqueued analyze job ${job.id} for encounter ${data.encounterId}`);
    return job.id!;
  }

  async enqueueTranscribe(data: Omit<TranscribeJobData, 'type'>): Promise<string> {
    const job = await this.queue.add('transcribe', { type: 'transcribe', ...data });
    this.logger.debug(`Enqueued transcribe job ${job.id} for audio ${data.audioId}`);
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    jobId: string;
    status: JobStatus;
    result?: InferenceJobResult;
    error?: string;
    progress: number;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { jobId, status: 'unknown', progress: 0 };
    }

    const state = await job.getState();
    return {
      jobId,
      status: state as JobStatus,
      result: state === 'completed' ? (job.returnvalue as InferenceJobResult) : undefined,
      error: state === 'failed' ? (job.failedReason ?? 'Unknown error') : undefined,
      progress: typeof job.progress === 'number' ? job.progress : 0,
    };
  }

  getQueue(): Queue<InferenceJobData, InferenceJobResult> {
    return this.queue;
  }
}

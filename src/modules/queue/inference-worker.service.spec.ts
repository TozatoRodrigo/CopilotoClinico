import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InferenceWorkerService } from './inference-worker.service';
import type { ConversationService } from '../copilot/intake/conversation.service';
import type { IntakeService } from '../copilot/intake/intake.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InferenceQueueService } from './inference-queue.service';
import { LgpdService } from '../lgpd/lgpd.service';
import { AiConsentRevokedException } from '../lgpd/ai-consent.exception';

vi.mock('ioredis', () => ({
  default: vi.fn(function (this: { disconnect: ReturnType<typeof vi.fn> }) {
    this.disconnect = vi.fn();
  }),
}));

let capturedProcessFn: ((job: unknown) => Promise<unknown>) | undefined;

vi.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {},
  Worker: vi.fn(function (
    this: { close: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> },
    _name: string,
    processFn: (job: unknown) => Promise<unknown>,
  ) {
    capturedProcessFn = processFn;
    this.close = vi.fn().mockResolvedValue(undefined);
    this.on = vi.fn();
  }),
}));

function makeConfig() {
  return new ConfigService({
    REDIS_URL: 'redis://localhost:6379',
    INFERENCE_QUEUE_CONCURRENCY: '2',
  });
}

/** Job do BullMQ em memória: `updateData` troca o que ficaria no Redis. */
function makeJob<T>(data: T) {
  const job = {
    data,
    id: 'test-job',
    name: 'test',
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateData: vi.fn(async (next: T) => {
      job.data = next;
    }),
  };
  return job;
}

const CASE_TEXT = 'Paciente 54 anos, CPF 529.982.247-25, dor torácica há 2 horas';
const ids = { physicianId: 'phy-1', encounterId: 'enc-1' };
const analyzeJob = { type: 'analyze' as const, ...ids, intakeId: 'intake-1' };
const legacyJob = {
  type: 'analyze' as const,
  ...ids,
  input: {
    caseText: CASE_TEXT,
    context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
  },
};

describe('InferenceWorkerService', () => {
  let service: InferenceWorkerService;
  let conversationMock: { analyze: ReturnType<typeof vi.fn> };
  let intakesMock: { openForQueue: ReturnType<typeof vi.fn> };
  let prismaMock: {
    audioCapture: {
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let auditMock: { log: ReturnType<typeof vi.fn> };
  let queueMock: { enqueueAnalyze: ReturnType<typeof vi.fn> };
  let lgpdMock: { assertAiProcessingAllowed: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessFn = undefined;

    conversationMock = { analyze: vi.fn().mockResolvedValue({ interactionId: 'int-1' }) };
    intakesMock = {
      openForQueue: vi.fn().mockResolvedValue({ id: 'intake-9', piiDetected: true }),
    };
    prismaMock = {
      audioCapture: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'aud-1',
          transcribedText: 'paciente com dor',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    auditMock = { log: vi.fn().mockResolvedValue(undefined) };
    queueMock = { enqueueAnalyze: vi.fn().mockResolvedValue('analyze-job-1') };
    lgpdMock = { assertAiProcessingAllowed: vi.fn().mockResolvedValue(undefined) };

    service = new InferenceWorkerService(
      makeConfig(),
      intakesMock as unknown as IntakeService,
      conversationMock as unknown as ConversationService,
      prismaMock as unknown as PrismaService,
      auditMock as unknown as AuditService,
      queueMock as unknown as InferenceQueueService,
      lgpdMock as unknown as LgpdService,
    );
    service.onModuleInit();
  });

  it('initializes worker on module init', () => {
    expect(capturedProcessFn).toBeDefined();
  });

  // CC-011 — o caso vem da conversa no banco; o resultado no Redis são só ids.
  it('analyzes the queued conversation and returns only ids', async () => {
    const result = await capturedProcessFn!(makeJob(analyzeJob));

    expect(conversationMock.analyze).toHaveBeenCalledWith('phy-1', 'enc-1', 'intake-1');
    expect(intakesMock.openForQueue).not.toHaveBeenCalled();
    expect(result).toEqual({ type: 'analyze', intakeId: 'intake-1', interactionId: 'int-1' });
  });

  // CC-011 — job enfileirado antes do deploy, com o caso sem redação.
  it('takes the text of a legacy job out of Redis before opening the conversation', async () => {
    const job = makeJob<object>(legacyJob);
    intakesMock.openForQueue.mockImplementation(async () => {
      expect(JSON.stringify(job.data)).not.toContain('dor torácica');
      return { id: 'intake-9' };
    });

    const result = await capturedProcessFn!(job);

    expect(intakesMock.openForQueue).toHaveBeenCalledWith('phy-1', 'enc-1', legacyJob.input);
    expect(job.data).toEqual({ type: 'analyze', ...ids, intakeId: 'intake-9' });
    expect(conversationMock.analyze).toHaveBeenCalledWith('phy-1', 'enc-1', 'intake-9');
    expect(result).toEqual({ type: 'analyze', intakeId: 'intake-9', interactionId: 'int-1' });
  });

  it('fails a legacy job cleanly, without the text, when the conversation is refused', async () => {
    const { UnrecoverableError } = await import('bullmq');
    const job = makeJob<object>(legacyJob);
    intakesMock.openForQueue.mockRejectedValue(
      new BadRequestException({ message: 'Input contains potentially unsafe content' }),
    );

    await expect(capturedProcessFn!(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(job.data).toEqual({ type: 'analyze', ...ids });
    expect(conversationMock.analyze).not.toHaveBeenCalled();
  });

  it('fails without retry a legacy job whose text a previous attempt already removed', async () => {
    const { UnrecoverableError } = await import('bullmq');

    await expect(capturedProcessFn!(makeJob({ type: 'analyze', ...ids }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(conversationMock.analyze).not.toHaveBeenCalled();
  });

  // CC-010 — revogado entre o pedido e a vez do job: nenhuma chamada de IA e
  // nenhuma nova tentativa (a recusa não muda no retry).
  it('fails the analyze job without retry when ai_processing was revoked', async () => {
    lgpdMock.assertAiProcessingAllowed.mockRejectedValue(new AiConsentRevokedException());
    const { UnrecoverableError } = await import('bullmq');

    await expect(capturedProcessFn!(makeJob(analyzeJob))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(lgpdMock.assertAiProcessingAllowed).toHaveBeenCalledWith('phy-1');
    expect(conversationMock.analyze).not.toHaveBeenCalled();
  });

  it('keeps retrying server failures (5xx and unexpected errors)', async () => {
    conversationMock.analyze.mockRejectedValue(new Error('provider timeout'));
    const { UnrecoverableError } = await import('bullmq');

    const failure = capturedProcessFn!(makeJob(analyzeJob));
    await expect(failure).rejects.toThrow('provider timeout');
    await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it('processes transcribe job: opens a conversation and enqueues only its id', async () => {
    const job = makeJob({ type: 'transcribe', audioId: 'aud-1', ...ids });

    const result = await capturedProcessFn!(job);

    expect(prismaMock.audioCapture.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'aud-1' },
    });
    expect(prismaMock.audioCapture.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'transcribing' } }),
    );
    expect(intakesMock.openForQueue).toHaveBeenCalledWith(
      'phy-1',
      'enc-1',
      expect.objectContaining({ caseText: 'paciente com dor', redFlags: {} }),
    );
    expect(queueMock.enqueueAnalyze).toHaveBeenCalledWith({ ...ids, intakeId: 'intake-9' });
    expect(prismaMock.audioCapture.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'completed' } }),
    );
    expect(auditMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUDIO_PIPELINE_QUEUED',
        payload: { analyzeJobId: 'analyze-job-1', intakeId: 'intake-9', piiDetected: true },
      }),
    );
    // A transcrição é o caso: fica no banco, não no resultado do job.
    expect(result).toEqual({ type: 'transcribe', audioId: 'aud-1', analyzeJobId: 'analyze-job-1' });
  });

  it('throws when transcribe job has no transcript', async () => {
    prismaMock.audioCapture.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'aud-2',
      transcribedText: null,
    });

    const job = makeJob({ type: 'transcribe', audioId: 'aud-2', ...ids });
    await expect(capturedProcessFn!(job)).rejects.toThrow('has no transcribedText');
  });

  it('closes worker and disconnects on destroy', async () => {
    await service.onModuleDestroy();
  });
});

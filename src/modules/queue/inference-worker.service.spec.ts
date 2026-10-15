import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { InferenceWorkerService } from './inference-worker.service';
import { OrchestratorService } from '../copilot/orchestrator/orchestrator.service';
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

function makeJob<T>(data: T, updateProgress = vi.fn().mockResolvedValue(undefined)) {
  return { data, id: 'test-job', name: 'test', updateProgress };
}

describe('InferenceWorkerService', () => {
  let service: InferenceWorkerService;
  let orchestratorMock: { analyze: ReturnType<typeof vi.fn> };
  let prismaMock: {
    audioCapture: {
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let auditMock: { log: ReturnType<typeof vi.fn> };
  let queueMock: { enqueueAnalyze: ReturnType<typeof vi.fn> };
  let lgpdMock: { assertAiProcessingAllowed: ReturnType<typeof vi.fn> };

  const orchestratorResult = {
    interactionId: 'int-1',
    output: {
      reasoning: '',
      recommendations: [],
      uncertainty: false,
      uncertaintyReason: null,
      differentials: [],
    },
    citations: [],
    metadata: {
      piiDetected: false,
      injectionDetected: false,
      chunksRetrieved: 0,
      latencyMs: 100,
      cost: 0,
      model: 'm',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessFn = undefined;

    orchestratorMock = { analyze: vi.fn().mockResolvedValue(orchestratorResult) };
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
      orchestratorMock as unknown as OrchestratorService,
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

  it('processes analyze job via orchestrator', async () => {
    const job = makeJob({
      type: 'analyze',
      physicianId: 'phy-1',
      encounterId: 'enc-1',
      input: {
        caseText: 'test',
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      },
    });

    const result = await capturedProcessFn!(job);

    expect(orchestratorMock.analyze).toHaveBeenCalledWith('phy-1', 'enc-1', job.data.input);
    expect(result).toEqual(expect.objectContaining({ type: 'analyze' }));
  });

  // CC-010 — revogado entre o pedido e a vez do job: nenhuma chamada de IA e
  // nenhuma nova tentativa (a recusa não muda no retry).
  it('fails the analyze job without retry when ai_processing was revoked', async () => {
    lgpdMock.assertAiProcessingAllowed.mockRejectedValue(new AiConsentRevokedException());
    const { UnrecoverableError } = await import('bullmq');
    const job = makeJob({
      type: 'analyze',
      physicianId: 'phy-1',
      encounterId: 'enc-1',
      input: {
        caseText: 'test',
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      },
    });

    await expect(capturedProcessFn!(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(lgpdMock.assertAiProcessingAllowed).toHaveBeenCalledWith('phy-1');
    expect(orchestratorMock.analyze).not.toHaveBeenCalled();
  });

  it('keeps retrying server failures (5xx and unexpected errors)', async () => {
    orchestratorMock.analyze.mockRejectedValue(new Error('provider timeout'));
    const { UnrecoverableError } = await import('bullmq');
    const job = makeJob({
      type: 'analyze',
      physicianId: 'phy-1',
      encounterId: 'enc-1',
      input: {
        caseText: 'test',
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      },
    });

    const failure = capturedProcessFn!(job);
    await expect(failure).rejects.toThrow('provider timeout');
    await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it('processes transcribe job: updates status and enqueues analyze', async () => {
    const job = makeJob({
      type: 'transcribe',
      audioId: 'aud-1',
      physicianId: 'phy-1',
      encounterId: 'enc-1',
    });

    const result = await capturedProcessFn!(job);

    expect(prismaMock.audioCapture.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'aud-1' },
    });
    expect(prismaMock.audioCapture.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'transcribing' } }),
    );
    expect(queueMock.enqueueAnalyze).toHaveBeenCalled();
    expect(prismaMock.audioCapture.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'completed' } }),
    );
    expect(auditMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUDIO_PIPELINE_QUEUED' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        type: 'transcribe',
        audioId: 'aud-1',
        analyzeJobId: 'analyze-job-1',
      }),
    );
  });

  it('throws when transcribe job has no transcript', async () => {
    prismaMock.audioCapture.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'aud-2',
      transcribedText: null,
    });

    const job = makeJob({
      type: 'transcribe',
      audioId: 'aud-2',
      physicianId: 'phy-1',
      encounterId: 'enc-1',
    });
    await expect(capturedProcessFn!(job)).rejects.toThrow('has no transcribedText');
  });

  it('closes worker and disconnects on destroy', async () => {
    await service.onModuleDestroy();
  });
});

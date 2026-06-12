import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { InferenceWorkerService } from './inference-worker.service';
import { OrchestratorService } from '../copilot/orchestrator/orchestrator.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InferenceQueueService } from './inference-queue.service';

vi.mock('ioredis', () => ({
  default: vi.fn(function (this: { disconnect: ReturnType<typeof vi.fn> }) {
    this.disconnect = vi.fn();
  }),
}));

let capturedProcessFn: ((job: unknown) => Promise<unknown>) | undefined;

vi.mock('bullmq', () => ({
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
  return new ConfigService({ REDIS_URL: 'redis://localhost:6379', INFERENCE_QUEUE_CONCURRENCY: '2' });
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

  const orchestratorResult = {
    interactionId: 'int-1',
    output: { reasoning: '', recommendations: [], uncertainty: false, uncertaintyReason: null, differentials: [] },
    citations: [],
    metadata: { piiDetected: false, injectionDetected: false, chunksRetrieved: 0, latencyMs: 100, cost: 0, model: 'm' },
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

    service = new InferenceWorkerService(
      makeConfig(),
      orchestratorMock as unknown as OrchestratorService,
      prismaMock as unknown as PrismaService,
      auditMock as unknown as AuditService,
      queueMock as unknown as InferenceQueueService,
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
      input: { caseText: 'test', context: { hasCT: false, isSus: false, hasLab: false, hasICU: false } },
    });

    const result = await capturedProcessFn!(job);

    expect(orchestratorMock.analyze).toHaveBeenCalledWith('phy-1', 'enc-1', job.data.input);
    expect(result).toEqual(expect.objectContaining({ type: 'analyze' }));
  });

  it('processes transcribe job: updates status and enqueues analyze', async () => {
    const job = makeJob({
      type: 'transcribe',
      audioId: 'aud-1',
      physicianId: 'phy-1',
      encounterId: 'enc-1',
    });

    const result = await capturedProcessFn!(job);

    expect(prismaMock.audioCapture.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'aud-1' } });
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
      expect.objectContaining({ type: 'transcribe', audioId: 'aud-1', analyzeJobId: 'analyze-job-1' }),
    );
  });

  it('throws when transcribe job has no transcript', async () => {
    prismaMock.audioCapture.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'aud-2',
      transcribedText: null,
    });

    const job = makeJob({ type: 'transcribe', audioId: 'aud-2', physicianId: 'phy-1', encounterId: 'enc-1' });
    await expect(capturedProcessFn!(job)).rejects.toThrow('has no transcribedText');
  });

  it('closes worker and disconnects on destroy', async () => {
    await service.onModuleDestroy();
  });
});

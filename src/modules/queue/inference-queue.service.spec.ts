import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { InferenceQueueService } from './inference-queue.service';

vi.mock('ioredis', () => ({
  default: vi.fn(function (this: { disconnect: ReturnType<typeof vi.fn> }) {
    this.disconnect = vi.fn();
  }),
}));

const mockJob = {
  id: 'job-1',
  data: { physicianId: 'phy-1' } as { physicianId: string },
  getState: vi.fn(),
  returnvalue: null as unknown,
  failedReason: null as unknown,
  progress: 50,
};
const mockQueue = {
  add: vi.fn().mockResolvedValue(mockJob),
  getJob: vi.fn().mockResolvedValue(mockJob),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('bullmq', () => ({
  Queue: vi.fn(function () {
    return mockQueue;
  }),
}));

function makeConfig() {
  return new ConfigService({ REDIS_URL: 'redis://localhost:6379' });
}

describe('InferenceQueueService', () => {
  let service: InferenceQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJob.getState = vi.fn().mockResolvedValue('waiting');
    mockJob.data = { physicianId: 'phy-1' };
    mockJob.returnvalue = null;
    mockJob.failedReason = null;
    mockQueue.add.mockResolvedValue(mockJob);
    mockQueue.getJob.mockResolvedValue(mockJob);

    service = new InferenceQueueService(makeConfig());
    service.onModuleInit();
  });

  it('enqueueAnalyze returns jobId', async () => {
    const jobId = await service.enqueueAnalyze({
      physicianId: 'phy-1',
      encounterId: 'enc-1',
      input: { caseText: 'test', context: { hasCT: false, isSus: false, hasLab: false, hasICU: false } },
    });
    expect(jobId).toBe('job-1');
    expect(mockQueue.add).toHaveBeenCalledWith('analyze', expect.objectContaining({ type: 'analyze' }));
  });

  it('enqueueTranscribe returns jobId', async () => {
    const jobId = await service.enqueueTranscribe({
      audioId: 'aud-1',
      physicianId: 'phy-1',
      encounterId: 'enc-1',
    });
    expect(jobId).toBe('job-1');
    expect(mockQueue.add).toHaveBeenCalledWith('transcribe', expect.objectContaining({ type: 'transcribe' }));
  });

  it('getJobStatus returns unknown when job not found', async () => {
    mockQueue.getJob.mockResolvedValueOnce(null);
    const result = await service.getJobStatus('missing-job', 'phy-1');
    expect(result.status).toBe('unknown');
  });

  it('getJobStatus returns active status for the job owner', async () => {
    mockJob.getState.mockResolvedValueOnce('active');
    const result = await service.getJobStatus('job-1', 'phy-1');
    expect(result.status).toBe('active');
    expect(result.progress).toBe(50);
  });

  it('getJobStatus returns completed with result for the job owner', async () => {
    const fakeResult = { type: 'analyze', assessment: 'ok' };
    mockJob.getState.mockResolvedValueOnce('completed');
    mockJob.returnvalue = fakeResult;
    const result = await service.getJobStatus('job-1', 'phy-1');
    expect(result.status).toBe('completed');
    expect(result.result).toEqual(fakeResult);
  });

  it('getJobStatus returns failed with error for the job owner', async () => {
    mockJob.getState.mockResolvedValueOnce('failed');
    mockJob.failedReason = 'Something went wrong';
    const result = await service.getJobStatus('job-1', 'phy-1');
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Something went wrong');
  });

  // SEC-04 — regression: job IDs são sequenciais/adivinháveis (BullMQ
  // auto-increment, nunca passamos jobId custom). Sem esta checagem, um
  // médico conseguia ler o resultado da análise clínica de outro médico só
  // incrementando o jobId no path da requisição.
  it('getJobStatus returns unknown (not the real state) when the job belongs to another physician', async () => {
    mockJob.getState.mockResolvedValueOnce('completed');
    mockJob.returnvalue = { type: 'analyze', assessment: 'dados de outro paciente' };
    const result = await service.getJobStatus('job-1', 'attacker-phy-id');
    expect(result.status).toBe('unknown');
    expect(result.result).toBeUndefined();
  });
});

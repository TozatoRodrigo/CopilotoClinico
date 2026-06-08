import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { InferenceQueueService } from '../queue/inference-queue.service';
import { PrismaService } from '../../config/prisma.service';

describe('CopilotService', () => {
  let service: CopilotService;
  let orchestratorMock: {
    analyze: ReturnType<typeof vi.fn>;
    analyzeStream: ReturnType<typeof vi.fn>;
  };
  let queueMock: {
    enqueueAnalyze: ReturnType<typeof vi.fn>;
    getJobStatus: ReturnType<typeof vi.fn>;
  };

  const physicianId = 'phys-001';
  const encounterId = 'enc-001';
  const input = {
    caseText: 'Paciente com dor torácica aguda e dispneia há 2 horas',
    context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
  };

  const orchestratorResult = {
    interactionId: 'interaction-001',
    output: {
      reasoning: 'Clinical reasoning here',
      recommendations: [
        {
          action: 'Request ECG',
          rationale: 'Standard workup',
          citationChunkId: 'chunk-1',
          confidence: 0.9,
        },
      ],
      uncertainty: false,
      uncertaintyReason: null,
    },
    citations: [
      {
        chunkId: 'chunk-1',
        source: 'diretriz-a',
        sourceVersion: '1.0',
        text: 'Some guideline text',
      },
    ],
    metadata: {
      piiDetected: false,
      injectionDetected: false,
      chunksRetrieved: 2,
      latencyMs: 500,
      cost: 0.003,
      model: 'claude-3-sonnet',
    },
  };

  let prismaMock: {
    encounter: { findFirst: ReturnType<typeof vi.fn> };
    aiInteraction: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    orchestratorMock = { analyze: vi.fn(), analyzeStream: vi.fn() };
    queueMock = {
      enqueueAnalyze: vi.fn().mockResolvedValue('job-123'),
      getJobStatus: vi.fn().mockResolvedValue({ jobId: 'job-123', status: 'active', progress: 10 }),
    };
    prismaMock = {
      encounter: { findFirst: vi.fn() },
      aiInteraction: { findFirst: vi.fn() },
    };
    service = new CopilotService(
      orchestratorMock as unknown as OrchestratorService,
      queueMock as unknown as InferenceQueueService,
      prismaMock as unknown as PrismaService,
    );
  });

  describe('analyze', () => {
    it('delegates to orchestrator.analyze', async () => {
      orchestratorMock.analyze.mockResolvedValue(orchestratorResult);

      await service.analyze(physicianId, encounterId, input);

      expect(orchestratorMock.analyze).toHaveBeenCalledWith(physicianId, encounterId, input);
    });

    it('returns orchestrator result', async () => {
      orchestratorMock.analyze.mockResolvedValue(orchestratorResult);

      const result = await service.analyze(physicianId, encounterId, input);

      expect(result).toEqual(orchestratorResult);
      expect(result.interactionId).toBe('interaction-001');
      expect(result.output.recommendations).toHaveLength(1);
    });
  });

  describe('RT-001: stream', () => {
    async function* fakeGen() {
      yield { type: 'delta' as const, delta: 'hello' };
      yield { type: 'done' as const, result: orchestratorResult };
    }

    it('delegates to orchestrator.analyzeStream', () => {
      orchestratorMock.analyzeStream.mockReturnValue(fakeGen());

      service.stream(physicianId, encounterId, input);

      expect(orchestratorMock.analyzeStream).toHaveBeenCalledWith(physicianId, encounterId, input);
    });

    it('returns the async generator from orchestrator', async () => {
      orchestratorMock.analyzeStream.mockReturnValue(fakeGen());

      const gen = service.stream(physicianId, encounterId, input);
      const events = [];
      for await (const event of gen) {
        events.push(event);
      }

      expect(events[0]).toEqual({ type: 'delta', delta: 'hello' });
      expect(events[1]?.type).toBe('done');
    });
  });

  describe('RT-002: analyzeAsync', () => {
    it('enqueues analyze job and returns jobId', async () => {
      const result = await service.analyzeAsync(physicianId, encounterId, input);
      expect(result).toEqual({ jobId: 'job-123' });
      expect(queueMock.enqueueAnalyze).toHaveBeenCalledWith({ physicianId, encounterId, input });
    });
  });

  describe('RT-002: getJobStatus', () => {
    it('returns job status from queue service', async () => {
      const result = await service.getJobStatus('job-123');
      expect(result.status).toBe('active');
      expect(queueMock.getJobStatus).toHaveBeenCalledWith('job-123');
    });
  });

  describe('getLatestInteraction', () => {
    const mockInteraction = {
      id: 'interaction-001',
      rawOutput: { recommendations: [], uncertainty: false, uncertaintyReason: null },
      citations: [],
      uncertainty: false,
      uncertaintyReason: null,
      createdAt: new Date('2026-06-08'),
    };

    it('returns the most recent AI interaction for the encounter', async () => {
      prismaMock.encounter.findFirst.mockResolvedValue({ id: encounterId });
      prismaMock.aiInteraction.findFirst.mockResolvedValue(mockInteraction);

      const result = await service.getLatestInteraction(physicianId, encounterId);

      expect(result.interactionId).toBe('interaction-001');
      expect(result.output).toEqual(mockInteraction.rawOutput);
      expect(prismaMock.encounter.findFirst).toHaveBeenCalledWith({
        where: { id: encounterId, physicianId },
        select: { id: true },
      });
    });

    it('throws NotFoundException when encounter does not belong to physician', async () => {
      prismaMock.encounter.findFirst.mockResolvedValue(null);

      await expect(service.getLatestInteraction(physicianId, encounterId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.aiInteraction.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no interactions exist', async () => {
      prismaMock.encounter.findFirst.mockResolvedValue({ id: encounterId });
      prismaMock.aiInteraction.findFirst.mockResolvedValue(null);

      await expect(service.getLatestInteraction(physicianId, encounterId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

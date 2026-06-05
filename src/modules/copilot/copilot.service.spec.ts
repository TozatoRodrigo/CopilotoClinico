import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopilotService } from './copilot.service';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { EncountersService } from '../encounters/encounters.service';
import { PrismaService } from '../../config/prisma.service';

describe('CopilotService', () => {
  let service: CopilotService;
  let orchestratorMock: {
    analyze: ReturnType<typeof vi.fn>;
  };
  let encountersMock: {
    findById: ReturnType<typeof vi.fn>;
  };
  let prismaMock: {
    aiInteraction: {
      findFirst: ReturnType<typeof vi.fn>;
    };
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

  beforeEach(() => {
    vi.clearAllMocks();
    orchestratorMock = { analyze: vi.fn() };
    encountersMock = { findById: vi.fn() };
    prismaMock = { aiInteraction: { findFirst: vi.fn() } };
    service = new CopilotService(
      orchestratorMock as unknown as OrchestratorService,
      encountersMock as unknown as EncountersService,
      prismaMock as unknown as PrismaService,
    );
  });

  describe('analyze', () => {
    it('delegates to orchestrator.analyze', async () => {
      orchestratorMock.analyze.mockResolvedValue(orchestratorResult);

      await service.analyze(physicianId, encounterId, input);

      expect(orchestratorMock.analyze).toHaveBeenCalledWith(
        physicianId,
        encounterId,
        input,
      );
    });

    it('returns orchestrator result', async () => {
      orchestratorMock.analyze.mockResolvedValue(orchestratorResult);

      const result = await service.analyze(physicianId, encounterId, input);

      expect(result).toEqual(orchestratorResult);
      expect(result.interactionId).toBe('interaction-001');
      expect(result.output.recommendations).toHaveLength(1);
    });
  });

  describe('findLatestResult', () => {
    it('verifies encounter ownership and returns latest persisted result', async () => {
      encountersMock.findById.mockResolvedValue({ id: encounterId, physicianId });
      prismaMock.aiInteraction.findFirst.mockResolvedValue({
        id: 'interaction-001',
        rawOutput: orchestratorResult.output,
        citations: { recommendations: orchestratorResult.output.recommendations },
        retrievedChunkIds: ['chunk-1'],
        model: 'gpt-4.1-mini',
        latencyMs: 250,
        cost: 0.01,
        createdAt: new Date('2026-06-05T12:00:00.000Z'),
      });

      const result = await service.findLatestResult(physicianId, encounterId);

      expect(encountersMock.findById).toHaveBeenCalledWith(physicianId, encounterId);
      expect(prismaMock.aiInteraction.findFirst).toHaveBeenCalledWith({
        where: { encounterId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(
        expect.objectContaining({
          interactionId: 'interaction-001',
          output: orchestratorResult.output,
        }),
      );
    });
  });
});

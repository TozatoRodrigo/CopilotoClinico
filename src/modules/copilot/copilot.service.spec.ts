import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopilotService } from './copilot.service';
import { OrchestratorService } from './orchestrator/orchestrator.service';

describe('CopilotService', () => {
  let service: CopilotService;
  let orchestratorMock: {
    analyze: ReturnType<typeof vi.fn>;
    analyzeStream: ReturnType<typeof vi.fn>;
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
    orchestratorMock = { analyze: vi.fn(), analyzeStream: vi.fn() };
    service = new CopilotService(orchestratorMock as unknown as OrchestratorService);
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
      expect(events[1].type).toBe('done');
    });
  });
});

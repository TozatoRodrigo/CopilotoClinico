import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CopilotService } from './copilot.service';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { InferenceQueueService } from '../queue/inference-queue.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CopilotService', () => {
  let service: CopilotService;
  let orchestratorMock: {
    analyze: ReturnType<typeof vi.fn>;
    analyzeStream: ReturnType<typeof vi.fn>;
    continueAnalysis: ReturnType<typeof vi.fn>;
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
      differentials: [],
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
  let auditMock: { log: ReturnType<typeof vi.fn> };
  let configMock: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    orchestratorMock = { analyze: vi.fn(), analyzeStream: vi.fn(), continueAnalysis: vi.fn() };
    queueMock = {
      enqueueAnalyze: vi.fn().mockResolvedValue('job-123'),
      getJobStatus: vi.fn().mockResolvedValue({ jobId: 'job-123', status: 'active', progress: 10 }),
    };
    prismaMock = {
      encounter: { findFirst: vi.fn() },
      aiInteraction: { findFirst: vi.fn() },
    };
    configMock = { get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue) };
    auditMock = { log: vi.fn().mockResolvedValue(undefined) };
    service = new CopilotService(
      orchestratorMock as unknown as OrchestratorService,
      queueMock as unknown as InferenceQueueService,
      prismaMock as unknown as PrismaService,
      configMock as unknown as ConfigService,
      auditMock as unknown as AuditService,
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

  describe('DEC-002: respond', () => {
    const respondInput = {
      interactionId: 'interaction-001',
      answers: [{ questionId: 'q1', answer: 'sim' }],
    };

    it('delegates to orchestrator.continueAnalysis', async () => {
      orchestratorMock.continueAnalysis.mockResolvedValue(orchestratorResult);

      const result = await service.respond(physicianId, encounterId, respondInput);

      expect(orchestratorMock.continueAnalysis).toHaveBeenCalledWith(
        physicianId,
        encounterId,
        respondInput,
      );
      expect(result).toEqual(orchestratorResult);
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

  // SEC-04 — physicianId precisa chegar até InferenceQueueService.getJobStatus
  // para que ela valide dono do job (jobId é sequencial/adivinhável no BullMQ).
  describe('RT-002: getJobStatus', () => {
    it('returns job status from queue service, passing the caller physicianId', async () => {
      const result = await service.getJobStatus(physicianId, 'job-123');
      expect(result.status).toBe('active');
      expect(queueMock.getJobStatus).toHaveBeenCalledWith('job-123', physicianId);
    });
  });

  describe('getLatestInteraction', () => {
    const mockInteraction = {
      id: 'interaction-001',
      rawOutput: { recommendations: [], uncertainty: false, uncertaintyReason: null, differentials: [] },
      citations: [],
      uncertainty: false,
      uncertaintyReason: null,
      createdAt: new Date('2026-06-08'),
      turnIndex: 2,
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

    // UX-03 — o carregamento fresco de página (sem sessionStorage) precisa
    // do turno persistido e do teto de config para montar "Rodada N de M".
    it('exposes the persisted turnIndex and the configured maxTurns (UX-03)', async () => {
      prismaMock.encounter.findFirst.mockResolvedValue({ id: encounterId });
      prismaMock.aiInteraction.findFirst.mockResolvedValue(mockInteraction);
      configMock.get.mockImplementation((key: string, defaultValue?: unknown) =>
        key === 'COPILOT_MAX_TURNS' ? 5 : defaultValue,
      );

      const result = await service.getLatestInteraction(physicianId, encounterId);

      expect(result.turnIndex).toBe(2);
      expect(result.maxTurns).toBe(5);
    });

    it('falls back to the default maxTurns when COPILOT_MAX_TURNS is unset', async () => {
      prismaMock.encounter.findFirst.mockResolvedValue({ id: encounterId });
      prismaMock.aiInteraction.findFirst.mockResolvedValue(mockInteraction);

      const result = await service.getLatestInteraction(physicianId, encounterId);

      expect(result.maxTurns).toBe(5);
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

  /**
   * F7 — o botão "cenário errado". Os dois erros clínicos que motivaram
   * KB-005/KB-006 chegaram por mensagem, dias depois, sem interactionId nem
   * chunks recuperados. O valor destes testes está no PAYLOAD: sem o rastro
   * técnico, o reporte não vira caso de regressão.
   */
  describe('submitFeedback', () => {
    const interaction = {
      id: '11111111-1111-4111-8111-111111111111',
      model: 'claude-sonnet',
      turnIndex: 0,
      retrievedChunkIds: ['chunk-sepse-1', 'chunk-sepse-2'],
      params: { retrievalCoverage: 'partial' },
      citations: [{ chunkId: 'chunk-sepse-1', source: 'Surviving Sepsis Campaign' }],
    };

    it('registra o feedback com o rastro técnico necessário para reproduzir o caso', async () => {
      prismaMock.aiInteraction.findFirst.mockResolvedValue(interaction);

      const result = await service.submitFeedback('physician-1', 'encounter-1', {
        interactionId: interaction.id,
        kind: 'wrong_scenario',
        comment: 'Era dengue, foi para sepse.',
      });

      expect(result).toEqual({ recorded: true });
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'physician-1',
          action: 'COPILOT_FEEDBACK',
          entity: 'AiInteraction',
          entityId: interaction.id,
          payload: expect.objectContaining({
            kind: 'wrong_scenario',
            comment: 'Era dengue, foi para sepse.',
            retrievedChunkIds: ['chunk-sepse-1', 'chunk-sepse-2'],
            retrievalCoverage: 'partial',
            citedChunkIds: ['chunk-sepse-1'],
          }),
        }),
      );
    });

    it('não aceita feedback sobre a análise de outro médico', async () => {
      // O findFirst já filtra por physicianId — não confirmar a existência de
      // um atendimento alheio faz parte do contrato.
      prismaMock.aiInteraction.findFirst.mockResolvedValue(null);

      await expect(
        service.submitFeedback('physician-2', 'encounter-1', {
          interactionId: interaction.id,
          kind: 'wrong_scenario',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(auditMock.log).not.toHaveBeenCalled();
    });
  });
});

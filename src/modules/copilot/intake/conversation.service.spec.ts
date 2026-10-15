import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { CaseIntake } from '@prisma/client';
import type { PrismaService } from '../../../config/prisma.service';
import type {
  OrchestratorResult,
  OrchestratorService,
  ScreenedAnalysisInput,
  StreamEvent,
} from '../orchestrator/orchestrator.service';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import { intakeReadingFixture } from '../../../../tests/fixtures/intake-reading';
import { ConversationService } from './conversation.service';
import type { IntakeService } from './intake.service';

const physicianId = 'phys-001';
const encounterId = 'enc-001';
const intakeId = '00000000-0000-4000-8000-000000000001';

const screenedInput: ScreenedAnalysisInput = {
  caseText: 'Mulher, 34 anos, cefaleia.',
  answeredQuestions: [],
  context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
  redFlags: {},
  piiDetected: false,
  understanding: null,
};

const result = { interactionId: 'interaction-001' } as OrchestratorResult;
const attempt = new Date('2026-10-12T10:00:00Z');

function interaction(
  id: string,
  overrides: Partial<{
    turnIndex: number;
    parentInteractionId: string | null;
    rawOutput: unknown;
    answeredQuestions: unknown;
    createdAt: Date;
  }> = {},
) {
  return {
    id,
    inputRedacted: 'Mulher, 34 anos, cefaleia.',
    rawOutput: { reasoning: `plano ${id}`, recommendations: [], clarifyingQuestions: [] },
    citations: null as unknown,
    uncertainty: false,
    uncertaintyReason: null,
    createdAt: new Date('2026-10-12T10:00:00Z'),
    turnIndex: 0,
    parentInteractionId: null,
    answeredQuestions: null,
    params: { retrievalCoverage: null },
    ...overrides,
  };
}

function intakeRow(overrides: Partial<CaseIntake> = {}): CaseIntake {
  return {
    id: intakeId,
    encounterId,
    physicianId,
    caseTextRedacted: 'Mulher, 34 anos, cefaleia.',
    context: {},
    redFlags: {},
    demoCase: null,
    piiDetected: false,
    path: 'ask',
    status: 'closed',
    closeReason: 'all_answered',
    reading: null,
    readingModel: null,
    questions: [],
    answers: [],
    cost: 0,
    latencyMs: 0,
    analysisStartedAt: null,
    analysisInteractionId: null,
    closedAt: null,
    createdAt: new Date('2026-10-12T09:59:00Z'),
    updatedAt: new Date('2026-10-12T09:59:00Z'),
    ...overrides,
  };
}

describe('ConversationService', () => {
  let intake: {
    beginAnalysis: ReturnType<typeof vi.fn>;
    completeAnalysis: ReturnType<typeof vi.fn>;
    abandonAnalysis: ReturnType<typeof vi.fn>;
    latest: ReturnType<typeof vi.fn>;
  };
  let orchestrator: {
    analyzeScreened: ReturnType<typeof vi.fn>;
    analyzeScreenedStream: ReturnType<typeof vi.fn>;
  };
  let interactions: ReturnType<typeof interaction>[];
  let encounterFound: boolean;
  let env: Record<string, string>;
  let service: ConversationService;

  beforeEach(() => {
    intake = {
      beginAnalysis: vi.fn().mockResolvedValue({ input: screenedInput, attempt }),
      completeAnalysis: vi.fn().mockResolvedValue(undefined),
      abandonAnalysis: vi.fn().mockResolvedValue(undefined),
      latest: vi.fn().mockResolvedValue(null),
    };
    orchestrator = {
      analyzeScreened: vi.fn().mockResolvedValue(result),
      analyzeScreenedStream: vi.fn(),
    };
    interactions = [];
    encounterFound = true;
    env = {};

    const prisma = {
      encounter: { findFirst: vi.fn(async () => (encounterFound ? { id: encounterId } : null)) },
      aiInteraction: { findMany: vi.fn(async () => interactions) },
    };
    service = new ConversationService(
      prisma as unknown as PrismaService,
      intake as unknown as IntakeService,
      orchestrator as unknown as OrchestratorService,
      {
        get: vi.fn((key: string, fallback: unknown) => env[key] ?? fallback),
      } as unknown as ConfigService,
    );
  });

  describe('analyze', () => {
    it('links the plan to the conversation', async () => {
      await expect(service.analyze(physicianId, encounterId, intakeId)).resolves.toBe(result);

      expect(orchestrator.analyzeScreened).toHaveBeenCalledWith(
        physicianId,
        encounterId,
        screenedInput,
      );
      expect(intake.completeAnalysis).toHaveBeenCalledWith(intakeId, 'interaction-001');
    });

    it('frees the conversation for a new try when the plan fails', async () => {
      orchestrator.analyzeScreened.mockRejectedValue(new Error('validation failed'));

      await expect(service.analyze(physicianId, encounterId, intakeId)).rejects.toThrow(
        'validation failed',
      );
      expect(intake.abandonAnalysis).toHaveBeenCalledWith(intakeId, attempt);
    });
  });

  describe('stream', () => {
    async function collect(): Promise<StreamEvent[]> {
      const events: StreamEvent[] = [];
      for await (const event of service.stream(physicianId, encounterId, intakeId)) {
        events.push(event);
      }
      return events;
    }

    it('links the plan when the stream finishes', async () => {
      orchestrator.analyzeScreenedStream.mockImplementation(async function* () {
        yield { type: 'delta', delta: '{' };
        yield { type: 'done', result };
      });

      const events = await collect();

      expect(events.map((event) => event.type)).toEqual(['delta', 'done']);
      expect(intake.completeAnalysis).toHaveBeenCalledWith(intakeId, 'interaction-001');
      expect(intake.abandonAnalysis).not.toHaveBeenCalled();
    });

    it('frees the conversation when the stream ends with an error', async () => {
      orchestrator.analyzeScreenedStream.mockImplementation(async function* () {
        yield { type: 'error', errors: ['Output is not valid JSON'] };
      });

      await collect();

      expect(intake.completeAnalysis).not.toHaveBeenCalled();
      expect(intake.abandonAnalysis).toHaveBeenCalledWith(intakeId, attempt);
    });
  });

  describe('get', () => {
    it('shows the latest thread of rounds for a case from before the guided copilot', async () => {
      interactions = [
        interaction('old-root'),
        interaction('root'),
        interaction('turn-1', {
          turnIndex: 1,
          parentInteractionId: 'root',
          answeredQuestions: [
            { questionId: 'q1', question: 'Glicemia?', answer: '54', turnIndex: 0 },
          ],
        }),
      ];

      const conversation = await service.get(physicianId, encounterId);

      expect(conversation.intake).toBeNull();
      expect(conversation.turns.map((turn) => turn.interactionId)).toEqual(['root', 'turn-1']);
      expect(conversation.turns[1]?.answeredQuestions).toEqual([
        { questionId: 'q1', question: 'Glicemia?', answer: '54' },
      ]);
      expect(conversation.maxTurns).toBe(5);
    });

    it('shows only the rounds that came from the conversation', async () => {
      intake.latest.mockResolvedValue(intakeRow({ analysisInteractionId: 'root' }));
      interactions = [
        interaction('root', {
          answeredQuestions: [
            { questionId: 'intake-1', question: 'Início súbito?', answer: 'Não', turnIndex: -1 },
          ],
        }),
        interaction('turn-1', { turnIndex: 1, parentInteractionId: 'root' }),
        interaction('other-root'),
      ];

      const conversation = await service.get(physicianId, encounterId);

      expect(conversation.intake?.intakeId).toBe(intakeId);
      expect(conversation.turns.map((turn) => turn.interactionId)).toEqual(['root', 'turn-1']);
      // As respostas de antes do 1º plano aparecem na conversa, não na rodada.
      expect(conversation.turns[0]?.answeredQuestions).toEqual([]);
    });

    it('shows no rounds while the conversation has no plan yet', async () => {
      intake.latest.mockResolvedValue(intakeRow({ status: 'asking', closeReason: null }));
      interactions = [interaction('older-case-root')];

      const conversation = await service.get(physicianId, encounterId);

      expect(conversation.turns).toEqual([]);
    });

    it('leaves out a round that failed validation', async () => {
      interactions = [
        interaction('root'),
        interaction('failed', {
          turnIndex: 1,
          parentInteractionId: 'root',
          rawOutput: { raw: '', validationErrors: ['Output is not valid JSON'] },
        }),
      ];

      const conversation = await service.get(physicianId, encounterId);

      expect(conversation.turns.map((turn) => turn.interactionId)).toEqual(['root']);
    });

    it('lists one citation per cited source, as the plan screen reads them', async () => {
      interactions = [
        {
          ...interaction('root'),
          citations: {
            recommendations: [
              {
                chunkId: 'chunk-1',
                source: 'Diretriz AVC',
                sourceVersion: '2024',
                sourceText: 'Trombólise após TC.',
                origin: 'public',
              },
              { chunkId: 'chunk-1', source: 'Diretriz AVC', sourceVersion: '2024' },
              { chunkId: null, source: 'Conhecimento geral do modelo' },
            ],
          },
        },
      ];

      const conversation = await service.get(physicianId, encounterId);

      expect(conversation.turns[0]?.citations).toEqual([
        {
          chunkId: 'chunk-1',
          source: 'Diretriz AVC',
          sourceVersion: '2024',
          text: 'Trombólise após TC.',
          origin: 'public',
        },
      ]);
    });

    it('shows the stored citations with their evidence when the analysis saved them', async () => {
      const source = {
        chunkId: 'chunk-1',
        source: 'Diretriz AVC',
        sourceVersion: '2024',
        text: 'Trombólise após TC.',
        institutionId: null,
        origin: 'public',
        evidenceTable: { columns: ['Janela'], rows: [['4,5 h']] },
      };
      interactions = [
        {
          ...interaction('root'),
          citations: { recommendations: [{ chunkId: 'chunk-1' }], sources: [source] },
        },
      ];

      const conversation = await service.get(physicianId, encounterId);

      expect(conversation.turns[0]?.citations).toEqual([source]);
    });

    describe('ferramentas no plano (CC-332)', () => {
      const strokePlan = {
        reasoning: 'plano',
        recommendations: [{ action: 'Angio-TC para oclusão de grande vaso' }],
        clarifyingQuestions: [],
        understanding: understandingFixture(),
      };

      it('with the flag off the response is the same as before: no field at all', async () => {
        interactions = [interaction('root', { rawOutput: strokePlan })];

        const conversation = await service.get(physicianId, encounterId);

        expect(conversation.turns[0]).not.toHaveProperty('toolSuggestions');
      });

      it('suggests the tool from the round understanding, with the case data', async () => {
        env = { COPILOT_TOOL_SUGGESTIONS: 'on' };
        interactions = [
          interaction('root', {
            rawOutput: strokePlan,
            answeredQuestions: [
              { questionId: 'q1', question: 'Peso?', answer: 'Peso 80 kg', turnIndex: -1 },
            ],
          }),
        ];

        const conversation = await service.get(physicianId, encounterId);

        const suggestions = conversation.turns[0]?.toolSuggestions;
        expect(suggestions?.suggestions).toEqual([
          {
            ruleId: 'deficit-focal-nihss',
            target: { kind: 'calculator', calculatorId: 'nihss' },
            name: 'NIHSS',
            reason: 'Déficit neurológico focal: gravidade do AVC',
          },
        ]);
        expect(suggestions?.facts).toMatchObject({
          ageYears: 68,
          sex: 'M',
          weightKg: 80,
          systolicBp: 182,
          heartRate: 88,
        });
      });

      it('falls back to the guided-copilot case reading when the round has no understanding', async () => {
        env = { COPILOT_TOOL_SUGGESTIONS: 'on' };
        intake.latest.mockResolvedValue(
          intakeRow({
            analysisInteractionId: 'root',
            reading: intakeReadingFixture({ syndrome: 'intoxicacao' }) as never,
          }),
        );
        interactions = [interaction('root')];

        const conversation = await service.get(physicianId, encounterId);

        expect(conversation.turns[0]?.toolSuggestions?.suggestions.map(({ name }) => name)).toEqual(
          ['Intoxicações e antídotos'],
        );
      });

      it('leaves the round as before when there is nothing to read the case from', async () => {
        env = { COPILOT_TOOL_SUGGESTIONS: 'on' };
        interactions = [interaction('root')];

        const conversation = await service.get(physicianId, encounterId);

        expect(conversation.turns[0]).not.toHaveProperty('toolSuggestions');
      });
    });

    it('refuses a case that belongs to another physician', async () => {
      encounterFound = false;

      await expect(service.get(physicianId, encounterId)).rejects.toThrow(NotFoundException);
    });
  });
});

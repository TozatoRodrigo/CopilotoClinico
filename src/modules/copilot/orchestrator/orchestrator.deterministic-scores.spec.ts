import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OrchestratorService, type StreamEvent } from './orchestrator.service';
import { DECISION_V3_SYSTEM_PROMPT } from './decision-prompt-v3';
import type { PrismaService } from '../../../config/prisma.service';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type {
  ChatMessage,
  StreamCompletionResult,
} from '../../ai-gateway/providers/provider.interface';
import type { RetrievalService } from '../retrieval/retrieval.service';
import type { EncountersService } from '../../encounters/encounters.service';
import type { AttachmentsService } from '../../encounters/attachments/attachments.service';
import type { AuditService } from '../../audit/audit.service';
import type {
  UnderstandingOutcome,
  UnderstandingService,
} from '../understanding/understanding.service';
import type { WebResearchService } from '../research/web-research.service';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

/**
 * CC-333 — escores pelo motor no orquestrador. Com
 * `COPILOT_DETERMINISTIC_SCORES` desligada (padrão), o prompt e a saída ficam
 * byte a byte iguais aos de antes da flag: as impressões digitais abaixo
 * foram gravadas no código anterior a ela.
 */

const physicianId = 'phys-001';
const encounterId = 'enc-001';

/** Pneumonia com tudo o que o CURB-65 pede: o motor dá 5, o modelo escreveu 3. */
const caseText =
  'Mulher, 72 anos, febre e tosse produtiva há 3 dias, confusa e desorientada. FR 32 irpm, PA 85x50 mmHg, FC 118 bpm, SpO2 89% em ar ambiente, Tax 38,9. Ureia 64 mg/dL.';
const input = {
  caseText,
  context: { hasCT: true, isSus: true, hasLab: true, hasICU: true },
};

const pneumonia = understandingFixture({
  problemRepresentation:
    'Idosa de 72 anos com febre, tosse produtiva e confusão nova, hipotensa e taquipneica.',
  structuredData: {
    age: 72,
    sex: 'F',
    vitals: {
      systolicBp: 85,
      diastolicBp: 50,
      heartRate: 118,
      respiratoryRate: 32,
      spo2: 89,
      temperature: 38.9,
      glucose: null,
    },
    onset: 'há 3 dias',
    keyFindings: ['tosse produtiva', 'confusão mental nova'],
    relevantContext: [],
  },
  instability: { present: true, findings: ['hipotensão', 'taquipneia'] },
  syndrome: 'infeccao-respiratoria',
  cannotMiss: [
    {
      hypothesis: 'Sepse de foco pulmonar',
      whyPlausible: 'Febre, hipotensão e confusão',
      confirmOrRuleOut: 'Lactato e hemoculturas',
    },
  ],
  likely: [{ hypothesis: 'Pneumonia adquirida na comunidade', why: 'Febre e tosse produtiva' }],
  missingDiscriminators: [],
  searchQueries: ['pneumonia grave sepse'],
  timeCritical: true,
});

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    action: 'Internação em UTI (CURB-65 de 3 pontos)',
    rationale: 'qSOFA 2 com hipotensão e taquipneia',
    category: 'stabilization',
    layer: 'now',
    dependsOn: null,
    basis: 'model_knowledge',
    citationChunkId: null,
    confidence: 0.9,
    ...overrides,
  };
}

function v3Output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    reasoning: 'Pneumonia grave com sepse provável: CURB-65 de 3 e qSOFA 2.',
    redFlags: [],
    recommendations: [
      recommendation(),
      recommendation({
        action: 'Antibiótico IV na primeira hora após hemoculturas',
        rationale: 'Sepse de foco pulmonar',
        category: 'therapeutic',
      }),
    ],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
    ...overrides,
  });
}

function v1Output(): string {
  return JSON.stringify({
    reasoning: 'Pneumonia grave: CURB-65 de 3.',
    redFlags: [],
    recommendations: [
      {
        action: 'Internação em UTI (CURB-65 de 3 pontos)',
        rationale: 'qSOFA 2 com hipotensão',
        citationChunkId: 'chunk-pac',
        confidence: 0.9,
        category: 'stabilization',
      },
    ],
    uncertainty: false,
    uncertaintyReason: null,
  });
}

function completion(content: string) {
  return {
    content,
    model: 'claude-3-sonnet',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    latencyMs: 1500,
  };
}

function stageOutcome(overrides: Partial<UnderstandingOutcome> = {}): UnderstandingOutcome {
  return {
    understanding: pneumonia,
    model: 'claude-haiku-5-5',
    usage: { promptTokens: 2000, completionTokens: 400, totalTokens: 2400 },
    cost: 0.002,
    latencyMs: 2100,
    ...overrides,
  };
}

const retrievalResult = {
  chunks: [
    {
      id: 'chunk-pac',
      text: 'Pneumonia grave: internação em UTI.',
      source: 'diretriz-pac',
      sourceVersion: '1.0',
      specialty: 'pneumologia',
      evidenceLevel: 'A',
      institutionId: null,
      score: 0.03,
      metadata: {},
      clinicallySigned: true,
    },
  ],
  totalRetrieved: 1,
  coverage: 'full',
  bestSemanticScore: 0.7,
  discardedByFloor: 0,
  official: { enabled: true, chunks: [], bestSemanticScore: 0, discardedByFloor: 0 },
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('OrchestratorService — escores pelo motor (CC-333)', () => {
  let env: Record<string, string>;
  let understand: ReturnType<typeof vi.fn>;
  let gateway: { complete: ReturnType<typeof vi.fn>; completeStream: ReturnType<typeof vi.fn> };
  let interactionCreate: ReturnType<typeof vi.fn>;
  let interactionFindFirst: ReturnType<typeof vi.fn>;
  let service: OrchestratorService;

  beforeEach(() => {
    env = {
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v3',
      COPILOT_KNOWLEDGE_SOURCE: 'model_only',
    };
    understand = vi.fn().mockResolvedValue(stageOutcome());
    gateway = {
      complete: vi.fn().mockResolvedValue(completion(v3Output())),
      completeStream: vi.fn(),
    };
    interactionCreate = vi.fn().mockResolvedValue({ id: 'interaction-001' });
    interactionFindFirst = vi.fn();

    const prisma = {
      aiInteraction: { create: interactionCreate, findFirst: interactionFindFirst },
      physician: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const encounters = {
      findById: vi.fn().mockResolvedValue({
        id: encounterId,
        physicianId,
        patientRef: 'PRN-001',
        institutionId: 'inst-1',
        context: input.context,
      }),
      update: vi.fn().mockResolvedValue({}),
      updateChiefComplaint: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: vi.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
    };
    const retrieval = {
      search: vi.fn().mockResolvedValue(retrievalResult),
      searchMany: vi.fn().mockResolvedValue(retrievalResult),
    };

    service = new OrchestratorService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      retrieval as unknown as RetrievalService,
      { forPrompt: vi.fn().mockResolvedValue([]) } as unknown as AttachmentsService,
      encounters as unknown as EncountersService,
      { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService,
      config as unknown as ConfigService,
      { understand } as unknown as UnderstandingService,
      { research: vi.fn() } as unknown as WebResearchService,
    );
  });

  function sentMessages(call = 0): ChatMessage[] {
    const params = gateway.complete.mock.calls[call]?.[0] as { messages: ChatMessage[] };
    return params.messages;
  }

  /** Reanálise no último turno: a instrução de último turno também vai no fim do prompt. */
  function finalTurnParent() {
    interactionFindFirst.mockResolvedValue({
      id: 'interaction-000',
      encounterId,
      turnIndex: 3,
      inputRedacted: caseText,
      answeredQuestions: null,
      params: { demoCase: null, redFlags: {} },
      rawOutput: { clarifyingQuestions: [{ id: 'q-1', question: 'Qual a ureia?' }] },
    });
    env.COPILOT_MAX_TURNS = '5';
  }

  // Gravadas no código anterior à flag (base feat/ferramentas-no-plano,
  // fc1129f6). Se um destes hashes mudar com a flag desligada, o prompt ou a
  // saída mudou para quem não ligou a flag.
  const FINGERPRINTS = {
    v3: {
      messages: '86c6b0f3351cceed94efdd886f53ad67b87db71baaa8a556cf335994123f9ec3',
      output: '9c0c8c2f0c23efce209dae6363492ecca6466695863bb928c41266570d3157f3',
    },
    legacy: {
      messages: '63ab5bcfdb83382d0b2d54fb6654dc2a03381d9c62adaf9876e36cc3ffa36b5e',
      output: '39ee560b7249067269b07b099ea0e09c9b1f2f7afb98e49f835e3450aa2eb894',
    },
    finalTurn: {
      messages: '97abdfe09ddf9016927757afa4c6e9f846a3cb7fef237eb7408ed45b01369cfe',
      output: '9c0c8c2f0c23efce209dae6363492ecca6466695863bb928c41266570d3157f3',
    },
  };

  describe('flag desligada: prompt e saída byte a byte iguais aos de antes', () => {
    it.each([
      ['ausente', undefined],
      ['off', 'off'],
      ['com typo', 'ligado'],
    ])('decisão v3 com a flag %s', async (_label, value) => {
      if (value !== undefined) env.COPILOT_DETERMINISTIC_SCORES = value;

      const result = await service.analyze(physicianId, encounterId, input);

      expect(sha256(sentMessages())).toBe(FINGERPRINTS.v3.messages);
      expect(sha256(result.output)).toBe(FINGERPRINTS.v3.output);
      expect(result.output).not.toHaveProperty('deterministicScores');
      expect(result.output.recommendations[0]?.action).toBe(
        'Internação em UTI (CURB-65 de 3 pontos)',
      );
    });

    it('legacy (decisão v1, sem entendimento)', async () => {
      env = {};
      gateway.complete.mockResolvedValue(completion(v1Output()));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(sha256(sentMessages())).toBe(FINGERPRINTS.legacy.messages);
      expect(sha256(result.output)).toBe(FINGERPRINTS.legacy.output);
    });

    it('reanálise no último turno, com a instrução de último turno', async () => {
      finalTurnParent();

      const result = await service.continueAnalysis(physicianId, encounterId, {
        interactionId: 'interaction-000',
        answers: [{ questionId: 'q-1', answer: 'Ureia 64 mg/dL' }],
      });

      expect(sha256(sentMessages())).toBe(FINGERPRINTS.finalTurn.messages);
      expect(sha256(result.output)).toBe(FINGERPRINTS.finalTurn.output);
    });
  });

  describe('flag ligada: pré-cálculo antes da decisão', () => {
    beforeEach(() => {
      env.COPILOT_DETERMINISTIC_SCORES = 'on';
    });

    it('entrega o CURB-65 do motor como fato, com as entradas, e mantém o system prompt', async () => {
      await service.analyze(physicianId, encounterId, input);

      const [system, user] = sentMessages();
      expect(system?.content).toBe(DECISION_V3_SYSTEM_PROMPT);
      expect(user?.content).toContain(
        '<system_scores type="COMPUTED_BY_THE_SYSTEM_FROM_CASE_DATA">',
      );
      expect(user?.content).toContain(
        '- CURB-65 = 5 pontos, calculado pelo sistema com: estado mental: confusão; ureia 64 mg/dL; FR 32 irpm; PA 85x50 mmHg; idade 72 anos',
      );
      expect(user?.content).toContain('SCORE RULE: never compute or estimate a clinical score');
      // O bloco fecha a mensagem: o resto do prompt é o de antes.
      expect(user?.content.indexOf('<system_scores')).toBeGreaterThan(
        user?.content.indexOf('Decide now') ?? Infinity,
      );
    });

    it('sem a ureia, não calcula: diz o que falta para a decisão pedir o dado', async () => {
      await service.analyze(physicianId, encounterId, {
        ...input,
        caseText: caseText.replace(' Ureia 64 mg/dL.', ''),
      });

      const user = sentMessages()[1]?.content ?? '';
      expect(user).toContain(
        'Not computed, because the case lacks the data:\n- CURB-65: falta saber ureia',
      );
      expect(user).not.toContain('CURB-65 =');
    });

    it('sem calculadora sugerida, só a regra: nenhum escore calculado pelo modelo', async () => {
      // Dor lombar: síndrome sem ferramenta e nenhuma regra de dado.
      understand.mockResolvedValue(
        stageOutcome({
          understanding: understandingFixture({
            syndrome: 'dor-lombar-flanco',
            cannotMiss: [],
            likely: [{ hypothesis: 'Lombalgia mecânica', why: 'Dor ao esforço' }],
          }),
        }),
      );

      await service.analyze(physicianId, encounterId, input);

      const user = sentMessages()[1]?.content ?? '';
      expect(user).not.toContain('<system_scores');
      expect(user).toContain('Cite a score only with a value the physician wrote in the case.');
    });

    it('no último turno, a instrução de último turno vem antes do bloco dos escores', async () => {
      finalTurnParent();

      await service.continueAnalysis(physicianId, encounterId, {
        interactionId: 'interaction-000',
        answers: [{ questionId: 'q-1', answer: 'Ureia 64 mg/dL' }],
      });

      const user = sentMessages()[1]?.content ?? '';
      expect(user.indexOf('Este é o último turno')).toBeGreaterThan(-1);
      expect(user.indexOf('<system_scores')).toBeGreaterThan(user.indexOf('Este é o último turno'));
    });
  });

  describe('flag ligada: verificação depois da decisão', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      env.COPILOT_DETERMINISTIC_SCORES = 'on';
      warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
    });

    function warnings(): string[] {
      return warn.mock.calls.map((call: unknown[]) => String(call[0]));
    }

    it('corrige o número divergente para o do motor e lista as entradas usadas', async () => {
      const result = await service.analyze(physicianId, encounterId, input);
      const [first, second] = result.output.recommendations;

      expect(first?.action).toBe(
        'Internação em UTI (CURB-65 de 5 pontos [corrigido pelo sistema])',
      );
      expect(first?.rationale).toBe(
        'qSOFA 3 [corrigido pelo sistema] com hipotensão e taquipneia' +
          ' [CURB-65 = 5 pontos, calculado pelo sistema com: estado mental: confusão; ureia 64 mg/dL; FR 32 irpm; PA 85x50 mmHg; idade 72 anos]' +
          ' [qSOFA = 3 pontos, calculado pelo sistema com: FR 32 irpm; PAS 85 mmHg; estado mental: confusão]',
      );
      expect(result.output.reasoning).toContain(
        'CURB-65 de 5 [corrigido pelo sistema] e qSOFA 3 [corrigido pelo sistema].',
      );
      // "ureia 64 mg/dL" nas entradas é concentração sérica, não dose: a
      // conduta não vira preliminar por causa da lista.
      expect(first?.preliminary).toBe(false);
      // Conduta sem escore: intacta.
      expect(second?.action).toBe('Antibiótico IV na primeira hora após hemoculturas');
      expect(second?.rationale).toBe('Sepse de foco pulmonar');
      // Nunca uma segunda chamada por causa do escore.
      expect(gateway.complete).toHaveBeenCalledTimes(1);
    });

    it('grava a conferência na saída e loga só ids, campo e referência', async () => {
      const result = await service.analyze(physicianId, encounterId, input);
      const scores = result.output.deterministicScores;

      expect(scores?.version).toBe('1.0.0');
      expect(scores?.computed.map(({ calculatorId }) => calculatorId)).toEqual(['curb65', 'qsofa']);
      expect(scores?.checks).toContainEqual({
        calculatorId: 'curb65',
        field: 'recommendations[0].action',
        cited: 3,
        outcome: 'corrected',
        reference: { source: 'engine', value: 5 },
        missing: [],
      });
      const persisted = interactionCreate.mock.calls[0]![0] as {
        data: { rawOutput: Record<string, unknown> };
      };
      expect(persisted.data.rawOutput.deterministicScores).toEqual(scores);

      expect(warnings()).toContain(
        'SCORE_CORRECTED calculator=curb65 field=recommendations[0].action reference=engine',
      );
      for (const line of warnings().filter((message) => message.startsWith('SCORE_'))) {
        expect(line).not.toMatch(/pneumonia|ureia|confus|hipotens|UTI/i);
      }
    });

    it('sem dado para calcular, troca o número pelo pedido do dado', async () => {
      const result = await service.analyze(physicianId, encounterId, {
        ...input,
        caseText: caseText.replace(' Ureia 64 mg/dL.', ''),
      });

      expect(result.output.recommendations[0]?.action).toBe(
        'Internação em UTI (CURB-65 [falta saber: ureia para calcular])',
      );
      expect(result.output.deterministicScores?.checks).toContainEqual({
        calculatorId: 'curb65',
        field: 'recommendations[0].action',
        cited: 3,
        outcome: 'missing_inputs',
        reference: null,
        missing: ['ureia'],
      });
      expect(warnings()).toContain(
        'SCORE_INPUTS_MISSING calculator=curb65 field=recommendations[0].action missing=1',
      );
      expect(gateway.complete).toHaveBeenCalledTimes(1);
    });

    it('valor que o próprio caso informa vale como referência quando o motor não calcula', async () => {
      gateway.complete.mockResolvedValue(
        completion(
          v3Output({
            recommendations: [
              recommendation({
                action: 'Proteger via aérea: Glasgow 7',
                rationale: 'Rebaixamento',
              }),
              recommendation({ action: 'TC de crânio', rationale: 'Glasgow 9 sem causa definida' }),
            ],
          }),
        ),
      );

      const result = await service.analyze(physicianId, encounterId, {
        ...input,
        caseText: `${caseText} Glasgow 9.`,
      });

      const [first, second] = result.output.recommendations;
      expect(first?.action).toBe(
        'Proteger via aérea: Glasgow 9 [corrigido pelo sistema: valor informado no caso]',
      );
      expect(second?.rationale).toBe('Glasgow 9 sem causa definida');
    });

    it('não mexe em saída sem escore com número', async () => {
      const output = v3Output({
        reasoning: 'Pneumonia grave; calcular CURB-65 e qSOFA (CURB-65 ≥ 3 indica UTI).',
        recommendations: [
          recommendation({ action: 'Calcular CURB-65', rationale: 'CURB-65 0–1 permite alta' }),
        ],
      });
      gateway.complete.mockResolvedValue(completion(output));

      const result = await service.analyze(physicianId, encounterId, input);
      const parsed = JSON.parse(output) as {
        reasoning: string;
        recommendations: Array<Record<string, unknown>>;
      };

      expect(result.output.reasoning).toBe(parsed.reasoning);
      expect(result.output.recommendations[0]).toMatchObject(parsed.recommendations[0] ?? {});
      expect(result.output.deterministicScores?.checks).toEqual([]);
    });

    it('confere também no streaming, antes do done', async () => {
      async function* fakeStream(content: string): AsyncGenerator<string, StreamCompletionResult> {
        yield content;
        return {
          content,
          model: 'claude-3-sonnet',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
          stopReason: 'end_turn',
        };
      }
      gateway.completeStream.mockImplementation(() => fakeStream(v3Output()));

      const events: StreamEvent[] = [];
      for await (const event of service.analyzeStream(physicianId, encounterId, input)) {
        events.push(event);
      }

      const done = events.find((event) => event.type === 'done');
      expect(done?.type === 'done' && done.result.output.recommendations[0]?.action).toBe(
        'Internação em UTI (CURB-65 de 5 pontos [corrigido pelo sistema])',
      );
    });

    it('sem entendimento (legacy), confere só com o que o texto traz', async () => {
      env = { COPILOT_DETERMINISTIC_SCORES: 'on' };
      gateway.complete.mockResolvedValue(completion(v1Output()));

      const result = await service.analyze(physicianId, encounterId, input);

      // Sem o entendimento não há FR, PA nem idade: o CURB-65 não sai.
      expect(result.output.recommendations[0]?.action).toBe(
        'Internação em UTI (CURB-65 [falta saber: frequência respiratória, pressão arterial (sistólica e diastólica) e idade para calcular])',
      );
      expect(sentMessages()[1]?.content).toContain('SCORE RULE');
    });
  });
});

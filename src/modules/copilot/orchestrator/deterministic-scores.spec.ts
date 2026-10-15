import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { CopilotOutput } from '../guardrails/output-validator';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import {
  DeterministicScoresSchema,
  caseScoreContext,
  describePrecomputed,
  describeScoreChecks,
  deterministicScoresEnabled,
  scoreInstructions,
  verifyScoreCitations,
} from './deterministic-scores';

/**
 * CC-333 — pré-cálculo e conferência dos escores, fora do orquestrador. O
 * caminho inteiro (prompt, gravação, log, streaming) está em
 * orchestrator.deterministic-scores.spec.ts.
 */

const pneumonia = understandingFixture({
  syndrome: 'infeccao-respiratoria',
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
    onset: null,
    keyFindings: [],
    relevantContext: [],
  },
  cannotMiss: [],
  likely: [{ hypothesis: 'Pneumonia adquirida na comunidade', why: 'Febre e tosse' }],
});
const caseText =
  'Mulher, 72 anos, confusa e desorientada. SpO2 89% em ar ambiente. Ureia 64 mg/dL.';
const context = caseScoreContext(pneumonia, caseText);

function output(overrides: Partial<CopilotOutput> = {}): CopilotOutput {
  return {
    reasoning: 'Pneumonia grave.',
    redFlags: [],
    recommendations: [],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
    ...overrides,
  };
}

function recommendation(action: string, rationale = 'Justificativa', dependsOn?: string | null) {
  return {
    action,
    rationale,
    citationChunkId: null,
    confidence: 0.8,
    preliminary: false,
    category: 'stabilization' as const,
    layer: dependsOn ? ('depends' as const) : ('now' as const),
    dependsOn: dependsOn ?? null,
    basis: 'model_knowledge' as const,
  };
}

describe('deterministicScoresEnabled', () => {
  it.each([
    [undefined, false],
    ['off', false],
    ['ligado', false],
    ['on', true],
    ['true', true],
  ])('%s → %s', (value, expected) => {
    const config = { get: () => value } as unknown as ConfigService;
    expect(deterministicScoresEnabled(config)).toBe(expected);
  });
});

describe('caseScoreContext', () => {
  it('pré-calcula a calculadora sugerida com entradas completas', () => {
    expect(context.precomputed).toEqual([
      expect.objectContaining({ calculatorId: 'curb65', status: 'complete', value: 5 }),
    ]);
    expect(describePrecomputed(context, ' (stream)')).toBe(
      'SCORE_PRECOMPUTED (stream) computed=curb65 incomplete=-',
    );
  });

  it('sem entendimento, não pré-calcula nada', () => {
    const legacy = caseScoreContext(null, caseText);
    expect(legacy.precomputed).toEqual([]);
    expect(scoreInstructions(legacy)).not.toContain('<system_scores');
  });

  it('não pede o que o caso já informa', () => {
    const coma = caseScoreContext(
      understandingFixture({ syndrome: 'rebaixamento-consciencia' }),
      'Rebaixamento, Glasgow 9.',
    );
    expect(coma.precomputed).toEqual([]);
    expect(coma.reported.get('gcs')).toBe(9);
  });

  it('o bloco do prompt só leva rótulos e números, nenhum texto do caso', () => {
    const block = scoreInstructions(context);
    expect(block).not.toContain('desorientada');
    expect(block).not.toContain('Mulher');
  });
});

describe('verifyScoreCitations', () => {
  it('concorda "ponto"/"pontos" ao corrigir e mantém o "/3"', () => {
    const { output: verified } = verifyScoreCitations(
      output({
        reasoning: 'CURB-65 de 1 ponto; qSOFA 2/3.',
      }),
      context,
    );
    expect(
      verified.reasoning.startsWith(
        'CURB-65 de 5 pontos [corrigido pelo sistema]; qSOFA 3/3 [corrigido pelo sistema].',
      ),
    ).toBe(true);
  });

  it('aceita o valor do motor arredondado como a citação escreveu', () => {
    const { scores } = verifyScoreCitations(
      output({ recommendations: [recommendation('Expansão volêmica (índice de choque 1,4)')] }),
      context,
    );
    expect(scores.checks).toEqual([
      expect.objectContaining({
        calculatorId: 'shock-index',
        outcome: 'match',
        reference: { source: 'engine', value: 1.39 },
      }),
    ]);
  });

  it('confere também a condição, o diferencial e a pergunta', () => {
    const { output: verified, scores } = verifyScoreCitations(
      output({
        recommendations: [recommendation('UTI', 'Gravidade', 'CURB-65 de 4 confirmado')],
        differentials: [
          {
            hypothesis: 'Sepse',
            whyConsider: 'qSOFA 1',
            whatDistinguishes: 'Lactato',
            cannotMiss: true,
            timeToHarm: 'horas',
          },
        ],
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'Qual a ureia? (CHA2DS2-VASc 3)',
            why: 'Fecha o CURB-65',
            criticality: 'important',
            expectedAnswerType: 'number',
          },
        ],
      }),
      context,
    );

    expect(verified.recommendations[0]?.dependsOn).toBe(
      'CURB-65 de 5 [corrigido pelo sistema] confirmado',
    );
    expect(verified.differentials[0]?.whyConsider).toBe('qSOFA 3 [corrigido pelo sistema]');
    expect(verified.clarifyingQuestions[0]?.question).toContain(
      'CHA2DS2-VASc [falta saber: os 7 itens para calcular]',
    );
    expect(scores.checks.map(({ field }) => field)).toEqual([
      'recommendations[0].dependsOn',
      'differentials[0].whyConsider',
      'clarifyingQuestions[0].question',
    ]);
  });

  it('escore do motor citado fora das condutas: as entradas vão no raciocínio, uma vez', () => {
    const { output: verified } = verifyScoreCitations(
      output({
        reasoning: 'Grave: CURB-65 de 5.',
        redFlags: [{ finding: 'CURB-65 de 5', severity: 'high', action: 'Considerar UTI' }],
      }),
      context,
    );
    const listing =
      '[CURB-65 = 5 pontos, calculado pelo sistema com: estado mental: confusão; ureia 64 mg/dL; FR 32 irpm; PA 85x50 mmHg; idade 72 anos]';
    expect(verified.reasoning).toBe(`Grave: CURB-65 de 5. ${listing}`);
    expect(verified.redFlags[0]?.finding).toBe('CURB-65 de 5');
  });

  it('conferir de novo o texto entregue não muda nada (idempotente)', () => {
    const first = verifyScoreCitations(
      output({ recommendations: [recommendation('UTI (CURB-65 de 3)', 'qSOFA 2')] }),
      context,
    );
    const second = verifyScoreCitations(first.output, context);

    expect(second.output).toEqual(first.output);
    expect(second.scores.checks.every(({ outcome }) => outcome === 'match')).toBe(true);
  });

  it('o registro segue o contrato e o log não tem texto clínico', () => {
    const { scores } = verifyScoreCitations(
      output({
        recommendations: [recommendation('UTI (CURB-65 de 3)', 'CHA2DS2-VASc 4')],
      }),
      context,
    );

    expect(DeterministicScoresSchema.parse(scores)).toEqual(scores);
    expect(describeScoreChecks(scores, '')).toEqual([
      'SCORE_CORRECTED calculator=curb65 field=recommendations[0].action reference=engine',
      'SCORE_INPUTS_MISSING calculator=chadsvasc field=recommendations[0].rationale missing=7',
    ]);
  });
});

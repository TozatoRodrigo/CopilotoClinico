import type { ClinicalCase } from './case.schema';
import type { ResultRow } from './records';

/**
 * Caso de teste do gabarito v2, independente dos arquivos de `cases/`: os
 * testes do juiz, da nota e do relatório não podem mudar de resultado porque
 * um caso real foi revisado.
 */
export function strokeCaseFixture(overrides: Partial<ClinicalCase> = {}): ClinicalCase {
  return {
    schemaVersion: 2,
    id: 'fi-003-avc-flutuante-como-hemorragico',
    title: 'Déficit focal flutuante tratado como hemorragia',
    tags: ['deficit-neurologico-focal'],
    critical: true,
    goldSource: 'field_incident',
    review: { status: 'draft' },
    input: {
      caseText:
        'M 67a, hemiparesia D que melhora e piora há 2 h. PA 168x94, glicemia 112. TC sem sangramento.',
      funnel: {
        opening: 'M 67a, fraqueza no braço D.',
        script: [
          {
            id: 'h-flutuacao',
            kind: 'history',
            text: 'A fraqueza melhora e piora há 2 horas.',
            key: true,
          },
          { id: 't-tc', kind: 'test', text: 'TC de crânio sem sangramento.' },
        ],
      },
    },
    expected: {
      syndrome: 'déficit neurológico focal agudo',
      diagnoses: [
        { text: 'AVC isquêmico com oclusão de grande vaso', tier: 'critical' },
        { text: 'AIT em crescendo', tier: 'important' },
      ],
      actions: [
        { text: 'angio-TC de crânio e pescoço imediata', tier: 'critical', timing: 'now' },
        {
          text: 'trombólise se elegível [ref.: alteplase 0,9 mg/kg]',
          tier: 'important',
          timing: 'any',
        },
      ],
      questions: ['horário do último momento visto bem'],
      forbiddenDefinitiveActions: [
        {
          id: 'conduta-de-avc-hemorragico',
          description: 'Reverter anticoagulação como se o déficit fosse hemorragia',
          patterns: ['complexo protrombinico', 'reverter anticoagul\\w*'],
        },
      ],
    },
    ...overrides,
  };
}

export function resultRowFixture(overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    runId: 'run',
    variant: 'teste',
    caseId: 'fi-003-avc-flutuante-como-hemorragico',
    rep: 0,
    status: 'ok',
    mode: 'complete',
    turns: [],
    harnessAttempts: 1,
    servedByFallback: false,
    servedModel: 'modelo',
    encounterId: 'enc',
    interactionId: 'int',
    output: null,
    understanding: null,
    webEvidence: null,
    research: null,
    citations: [],
    metadata: null,
    retrievedChunkIds: [],
    validationErrors: [],
    rawContent: null,
    completions: [],
    latency: { pipelineMs: 1, wallClockMs: 1 },
    cost: { pipelineReportedUsd: 0, computedUsd: 0, promptTokens: 0, completionTokens: 0 },
    startedAt: '2026-10-11T00:00:00.000Z',
    ...overrides,
  };
}

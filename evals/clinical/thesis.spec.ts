import { describe, expect, it } from 'vitest';
import { wilsonRate } from './stats';
import { renderThesis, thesisRows, thesisRunOf, type ThesisRun } from './thesis';

/** CC-413 — o veredito da tese sai dos erros críticos, caso a caso, contra a referência. */

function run(
  variant: string,
  options: {
    gate?: string[];
    all?: string[];
    cards?: number;
    usesCards?: boolean;
    extraDecisionModels?: string[];
    costUsd?: number | null;
    latencyMs?: number | null;
    incompleteRows?: number;
  } = {},
): ThesisRun {
  const all = options.all ?? options.gate ?? [];
  return {
    usesCards: options.usesCards ?? true,
    extraDecisionModels: options.extraDecisionModels ?? [],
    summary: {
      variant,
      servedModels: [variant],
      criticalErrors: {
        caseIds: all,
        criticalSubsetCaseIds: options.gate ?? [],
        incompleteRows: options.incompleteRows ?? 0,
      },
      criteria: {
        syndrome: wilsonRate(0, 0),
        criticalDiagnoses: wilsonRate(0, 0),
        importantDiagnoses: wilsonRate(8, 10),
        criticalActions: wilsonRate(0, 0),
        criticalActionsStrict: wilsonRate(0, 0),
        importantActions: wilsonRate(7, 10),
        actionsAnyLayer: wilsonRate(0, 0),
        questions: wilsonRate(0, 0),
        noForbiddenAction: wilsonRate(0, 0),
        safeNextStep: wilsonRate(0, 0),
      },
      cost: {
        pipelineComputedUsd: null,
        pipelineRowsWithoutPrice: 0,
        pipelineReportedUsd: 0,
        perExecutionUsd: options.costUsd === undefined ? 0.5 : options.costUsd,
        judgeUsd: null,
        judgeRowsWithoutPrice: 0,
        judgeTokens: { input: 0, output: 0 },
      },
      latency: {
        p50: options.latencyMs === undefined ? 20_000 : options.latencyMs,
        p90: null,
        wallClockP50: null,
        wallClockP90: null,
      },
      evidence: {
        recommendations: 10,
        sourced: wilsonRate(0, 0),
        webOfficial: 0,
        reviewedCard: options.cards ?? 3,
        reviewedCardWithDose: 1,
        modelKnowledge: 0,
        unverifiedDose: 0,
        research: { runs: 0, fallbacks: 0, webSearches: 0, costUsd: null, latencyP50: null },
      },
    },
  };
}

describe('thesisRows', () => {
  const opus = run('claude-opus-5-5-v3-modelo', {
    gate: ['c1'],
    all: ['c1', 'c2'],
    usesCards: false,
    cards: 0,
    costUsd: 1,
    latencyMs: 40_000,
  });

  it('sustenta quando o barato com cartões não passa os erros críticos do Opus', () => {
    const [, haiku] = thesisRows([
      opus,
      run('claude-haiku-5-5-v3-modelo-cartoes', {
        gate: ['c1'],
        all: ['c1', 'c3'],
        costUsd: 0.1,
        latencyMs: 10_000,
      }),
    ]);

    expect(haiku).toMatchObject({
      verdict: 'sustenta',
      criticalGateCases: 1,
      criticalCases: 2,
      newCriticalCases: ['c3'],
      costRatio: 0.1,
      latencyRatio: 0.25,
      cardCitations: 3,
    });
    expect(haiku?.importantItems).toMatchObject({ passed: 15, total: 20 });
  });

  it('não sustenta com mais erro crítico no portão ou no total', () => {
    const rows = thesisRows([
      opus,
      run('portao', { gate: ['c1', 'c4'], all: ['c1', 'c4'] }),
      run('total', { gate: ['c1'], all: ['c1', 'c2', 'c5'] }),
    ]);
    expect(rows.map((row) => row.verdict)).toEqual(['referência', 'não sustenta', 'não sustenta']);
  });

  it('é inconclusiva sem cartão citado, com outro modelo na decisão ou com resposta sem nota', () => {
    const rows = thesisRows([
      opus,
      run('sem-cartao', { cards: 0 }),
      run('rota', { extraDecisionModels: ['claude-opus-5-5'] }),
      run('sem-nota', { incompleteRows: 2 }),
    ]);
    expect(rows.slice(1).map((row) => row.verdict)).toEqual([
      'inconclusiva',
      'inconclusiva',
      'inconclusiva',
    ]);
    expect(rows[2]?.reason).toContain('ADR-016');
  });

  it('o par sem cartões não é julgado por não citar cartão', () => {
    const [, sonnet] = thesisRows([
      opus,
      run('claude-sonnet-5-5-v3-modelo', { usesCards: false, cards: 0 }),
    ]);
    expect(sonnet?.verdict).toBe('sustenta');
  });
});

describe('renderThesis', () => {
  it('uma linha por execução, com a referência em A', () => {
    const markdown = renderThesis(
      thesisRows([
        run('claude-opus-5-5-v3-modelo', { usesCards: false, cards: 0, costUsd: 1 }),
        run('claude-haiku-5-5-v3-modelo-cartoes', { costUsd: 0.2 }),
      ]),
    );
    expect(markdown).toContain('## Teste da tese (CC-413)');
    expect(markdown).toContain('| A: claude-opus-5-5-v3-modelo | não |');
    expect(markdown).toContain('| B: claude-haiku-5-5-v3-modelo-cartoes | sim |');
    expect(markdown).toContain('(0.20×)');
    expect(markdown).toContain('**sustenta**');
  });
});

describe('thesisRunOf', () => {
  function loaded(env: Record<string, string>, decision: [string | null, string | null]) {
    return {
      meta: {
        variant: { name: 'v', description: '', env },
        pipeline: {
          requestedModel: 'claude-haiku-5-5',
          decisionModel: decision[0],
          decisionCriticalModel: decision[1],
        },
      },
    } as unknown as Parameters<typeof thesisRunOf>[0];
  }
  const summary = run('v').summary as Parameters<typeof thesisRunOf>[1];

  it('lê a flag dos cartões da variante e os modelos da decisão fora do AI_MODEL', () => {
    expect(
      thesisRunOf(loaded({ COPILOT_REVIEWED_CARDS: 'on' }, ['claude-haiku-5-5', null]), summary),
    ).toMatchObject({ usesCards: true, extraDecisionModels: [] });
    expect(thesisRunOf(loaded({}, [null, 'claude-opus-5-5']), summary)).toMatchObject({
      usesCards: false,
      extraDecisionModels: ['claude-opus-5-5'],
    });
  });
});

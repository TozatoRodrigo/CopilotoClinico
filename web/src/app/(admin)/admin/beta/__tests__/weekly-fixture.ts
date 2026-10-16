import type { BetaActivationCounts } from '@contracts/beta';
import type { BetaWeeklyReport, BetaWeeklyUsage } from '@contracts/beta-weekly';

/**
 * CC-705 — relatório semanal de exemplo: a semana de 12/10/2026 vista na
 * sexta às 13h (horário de Brasília). Mesmos números da fixture da API
 * (src/modules/beta/beta-weekly-markdown.spec.ts).
 */

function counts(overrides: Partial<BetaActivationCounts>): BetaActivationCounts {
  return {
    registered: 0,
    eligible: 0,
    activated24h: 0,
    activatedRealCase24h: 0,
    rate: null,
    realCaseRate: null,
    ...overrides,
  };
}

function usage(overrides: Partial<BetaWeeklyUsage>): BetaWeeklyUsage {
  return {
    activePhysicians: 0,
    physiciansWithAnalysis: 0,
    analyses: 0,
    demoAnalyses: 0,
    analysesPerPhysician: { mean: null, median: null },
    distribution: [
      { bucket: '0', physicians: 0 },
      { bucket: '1', physicians: 0 },
      { bucket: '2-4', physicians: 0 },
      { bucket: '5-9', physicians: 0 },
      { bucket: '10+', physicians: 0 },
    ],
    ...overrides,
  };
}

export const WEEKLY_MARKDOWN = '## Beta · semana de 12/10 a 18/10/2026\n\n- Médicos ativos: 12\n';

export function weeklyReport(overrides: Partial<BetaWeeklyReport> = {}): BetaWeeklyReport {
  return {
    period: {
      current: {
        weekStart: '2026-10-12',
        weekEnd: '2026-10-18',
        from: '2026-10-12T03:00:00.000Z',
        to: '2026-10-16T16:00:00.000Z',
      },
      previous: {
        weekStart: '2026-10-05',
        weekEnd: '2026-10-11',
        from: '2026-10-05T03:00:00.000Z',
        to: '2026-10-09T16:00:00.000Z',
      },
      inProgress: true,
    },
    usage: {
      current: usage({
        activePhysicians: 12,
        physiciansWithAnalysis: 11,
        analyses: 41,
        demoAnalyses: 5,
        analysesPerPhysician: { mean: 3.4, median: 3 },
        distribution: [
          { bucket: '0', physicians: 1 },
          { bucket: '1', physicians: 3 },
          { bucket: '2-4', physicians: 5 },
          { bucket: '5-9', physicians: 2 },
          { bucket: '10+', physicians: 1 },
        ],
      }),
      previous: usage({
        activePhysicians: 9,
        physiciansWithAnalysis: 9,
        analyses: 25,
        analysesPerPhysician: { mean: 2.8, median: 2 },
      }),
    },
    feedback: {
      current: {
        negative: 2,
        helpful: 6,
        byKind: { wrong_scenario: 1, missing_coverage: 1, wrong_recommendation: 0, helpful: 6 },
        negativePer100Analyses: 4.9,
      },
      previous: {
        negative: 2,
        helpful: 3,
        byKind: { wrong_scenario: 0, missing_coverage: 2, wrong_recommendation: 0, helpful: 3 },
        negativePer100Analyses: 8,
      },
    },
    aiCost: {
      current: {
        count: 43,
        totalCostUsd: 9.03,
        avgCostUsd: 0.21,
        latency: { p50Ms: 38_240, p95Ms: 71_000 },
      },
      previous: {
        count: 26,
        totalCostUsd: 4.94,
        avgCostUsd: 0.19,
        latency: { p50Ms: 35_000, p95Ms: 64_400 },
      },
    },
    cardUsage: {
      available: false,
      reason: 'A decisão ainda não usa cartões revisados.',
      source: 'CC-408',
    },
    toolUsage: {
      available: false,
      reason: 'A área Ferramentas ainda não existe.',
      source: 'CC-304',
    },
    mentorship: {
      available: false,
      reason: 'Os pedidos de mentoria ainda não são gravados.',
      source: 'CC-707',
    },
    knowledgeGaps: {
      total: { current: 7, previous: 4 },
      top: [
        { syndrome: 'dor-toracica', current: 3, previous: 1 },
        { syndrome: null, current: 2, previous: 0 },
      ],
    },
    activation: {
      target: 0.7,
      current: {
        overall: counts({
          registered: 8,
          eligible: 6,
          activated24h: 4,
          activatedRealCase24h: 3,
          rate: 0.667,
          realCaseRate: 0.5,
        }),
        byBatch: [
          {
            batchLabel: 'rede Ripardo',
            ...counts({
              registered: 6,
              eligible: 5,
              activated24h: 4,
              activatedRealCase24h: 3,
              rate: 0.8,
              realCaseRate: 0.6,
            }),
          },
          {
            batchLabel: null,
            ...counts({ registered: 2, eligible: 1, rate: 0, realCaseRate: 0 }),
          },
        ],
      },
      previous: {
        overall: counts({
          registered: 4,
          eligible: 4,
          activated24h: 3,
          activatedRealCase24h: 3,
          rate: 0.75,
          realCaseRate: 0.75,
        }),
        byBatch: [
          {
            batchLabel: 'rede Ripardo',
            ...counts({
              registered: 4,
              eligible: 4,
              activated24h: 3,
              activatedRealCase24h: 3,
              rate: 0.75,
              realCaseRate: 0.75,
            }),
          },
        ],
      },
    },
    markdown: WEEKLY_MARKDOWN,
    generatedAt: '2026-10-16T16:00:00.000Z',
    ...overrides,
  };
}

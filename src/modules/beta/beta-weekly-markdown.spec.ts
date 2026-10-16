import { describe, expect, it } from 'vitest';
import { renderBetaWeeklyMarkdown } from './beta-weekly-markdown';
import type { BetaActivationCounts } from '../../shared/contracts/beta';
import type { BetaWeeklyReport, BetaWeeklyUsage } from '../../shared/contracts/beta-weekly';

function activationCounts(overrides: Partial<BetaActivationCounts>): BetaActivationCounts {
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

/** A semana de 12/10/2026 vista na sexta às 13h (horário de Brasília). */
function weeklyReportFixture(): Omit<BetaWeeklyReport, 'markdown'> {
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
        overall: activationCounts({
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
            ...activationCounts({
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
            ...activationCounts({ registered: 2, eligible: 1, rate: 0, realCaseRate: 0 }),
          },
        ],
      },
      previous: {
        overall: activationCounts({
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
            ...activationCounts({
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
    generatedAt: '2026-10-16T16:00:00.000Z',
  };
}

describe('resumo da semana em markdown (CC-705, ata da CC-706)', () => {
  it('follows the Friday agenda with the numbers filled and the rest to write in the meeting', () => {
    expect(renderBetaWeeklyMarkdown(weeklyReportFixture())).toBe(
      [
        '## Beta · semana de 12/10 a 18/10/2026',
        '',
        '> Semana em andamento: números até sex 16/10 às 13:00 (horário de Brasília). A semana anterior (05/10 a 11/10) entra até o mesmo dia e hora.',
        '',
        '### 1. Números (15 min)',
        '',
        '#### Uso',
        '',
        '- Médicos ativos: 12 (anterior: 9, +3)',
        '- Análises concluídas: 41 (anterior: 25, +16) · 5 do caso de exemplo, fora da conta',
        '- Análises por médico ativo: média 3,4 · mediana 3 (anterior: média 2,8 · mediana 2)',
        '- Médicos por número de análises: só respondeu pergunta: 1 · 1 análise: 3 · 2 a 4: 5 · 5 a 9: 2 · 10 ou mais: 1',
        '',
        '#### Qualidade',
        '',
        '- Feedback negativo: 4,9 por 100 análises (2 reportes) · anterior: 8 (2 reportes)',
        '- "Foi útil": 6 (anterior: 3, +3)',
        '- % de análises com cartão aplicado: sem dado (CC-408: A decisão ainda não usa cartões revisados.)',
        '',
        '#### IA',
        '',
        '- Custo por análise: US$ 0,21 (anterior: US$ 0,19) · total US$ 9,03 em 43 análises',
        '- Latência por análise: p50 38,2 s · p95 71 s (anterior: p50 35 s · p95 64,4 s)',
        '',
        '#### Ferramentas e mentoria',
        '',
        '- Uso de ferramentas: sem dado (CC-304: A área Ferramentas ainda não existe.)',
        '- Pedidos de mentoria: sem dado (CC-707: Os pedidos de mentoria ainda não são gravados.)',
        '',
        '#### Lacunas ("não encontrei o que precisava")',
        '',
        '- Total: 7 (anterior: 4, +3)',
        '1. dor-toracica: 3 (anterior: 1)',
        '2. sem síndrome registrada: 2 (anterior: 0)',
        '',
        '#### Ativação em 24 h (cadastros da semana · meta 70%)',
        '',
        '- Geral: 67% (4 de 6; caso real 50%) · anterior: 75% (3 de 4; caso real 75%)',
        '- rede Ripardo: 80% (4 de 5; caso real 60%) · anterior: 75% (3 de 4; caso real 75%)',
        '- Sem convite: 0% (0 de 1; caso real 0%)',
        '- 2 cadastros ainda não completaram 24 h e ficam fora da taxa',
        '',
        '### 2. Decisões (30 min)',
        '',
        '- ',
        '',
        '### 3. Próximos passos (15 min)',
        '',
        '- [ ] ',
        '',
        '_Gerado pelo painel do beta (/admin/beta) em sex 16/10 às 13:00. Sem dado de paciente; médicos só agregados._',
        '',
      ].join('\n'),
    );
  });

  it('compares a closed week with the whole previous one', () => {
    const report = weeklyReportFixture();
    report.period = {
      ...report.period,
      current: { ...report.period.current, to: '2026-10-19T03:00:00.000Z' },
      previous: { ...report.period.previous, to: '2026-10-12T03:00:00.000Z' },
      inProgress: false,
    };

    const markdown = renderBetaWeeklyMarkdown(report);

    expect(markdown).toContain('> Comparação com a semana de 05/10 a 11/10.');
    expect(markdown).not.toContain('Semana em andamento');
  });

  it('shows the number once the source story records it (extension point)', () => {
    const report = weeklyReportFixture();
    report.cardUsage = {
      available: true,
      current: { analyses: 41, withCard: 13, rate: 0.317 },
      previous: { analyses: 25, withCard: 5, rate: 0.2 },
    };
    report.toolUsage = {
      available: true,
      current: { uses: 23, physicians: 7 },
      previous: { uses: 10, physicians: 4 },
    };
    report.mentorship = {
      available: true,
      current: { requests: 2 },
      previous: { requests: 0 },
    };

    const markdown = renderBetaWeeklyMarkdown(report);

    expect(markdown).toContain(
      '- % de análises com cartão aplicado: 32% (13 de 41) (anterior: 20% (5 de 25))',
    );
    expect(markdown).toContain(
      '- Uso de ferramentas: 23 usos por 7 médicos (anterior: 10 usos por 4 médicos)',
    );
    expect(markdown).toContain('- Pedidos de mentoria: 2 (anterior: 0)');
    expect(markdown).not.toContain('sem dado');
  });

  it('reads well in an empty week', () => {
    const report = weeklyReportFixture();
    const empty = {
      ...report.usage.previous,
      activePhysicians: 0,
      physiciansWithAnalysis: 0,
      analyses: 0,
      analysesPerPhysician: { mean: null, median: null },
    };
    report.usage = { current: empty, previous: empty };
    report.feedback.current = {
      ...report.feedback.current,
      negative: 0,
      negativePer100Analyses: null,
    };
    report.aiCost.current = {
      count: 0,
      totalCostUsd: 0,
      avgCostUsd: null,
      latency: { p50Ms: null, p95Ms: null },
    };
    report.knowledgeGaps = { total: { current: 0, previous: 0 }, top: [] };
    report.activation.current = {
      overall: { ...report.activation.current.overall, registered: 0, eligible: 0 },
      byBatch: [],
    };

    const markdown = renderBetaWeeklyMarkdown(report);

    expect(markdown).toContain('- Médicos ativos: 0 (anterior: 0, igual)');
    expect(markdown).toContain('- Análises por médico ativo: média — · mediana —');
    expect(markdown).not.toContain('Médicos por número de análises');
    expect(markdown).toContain('- Feedback negativo: — por 100 análises (0 reportes)');
    expect(markdown).toContain(
      '- Custo por análise: — (anterior: US$ 0,19) · total US$ 0,00 em 0 análises',
    );
    expect(markdown).toContain('- Latência por análise: p50 — · p95 —');
    expect(markdown).toContain('- Total: 0 (anterior: 0, igual)');
    expect(markdown).toContain('- Geral: nenhum cadastro · anterior: 75%');
  });
});

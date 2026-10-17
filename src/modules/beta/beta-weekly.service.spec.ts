import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service';
import type { AiCallReportService } from '../analytics/ai-call-report.service';
import type { BetaActivationService } from './beta-activation.service';
import {
  BetaWeeklyService,
  rankGaps,
  summarizeFeedback,
  summarizeUsage,
  type PhysicianUsageRow,
} from './beta-weekly.service';
import type { BetaActivationCounts } from '../../shared/contracts/beta';

// Sexta 16/10/2026, 13:00 em Brasília.
const NOW = new Date('2026-10-16T16:00:00.000Z');
const CURRENT_FROM = '2026-10-12T03:00:00.000Z';
const PREVIOUS_FROM = '2026-10-05T03:00:00.000Z';

function usageRow(analyses: number, options: Partial<PhysicianUsageRow> = {}): PhysicianUsageRow {
  return { analyses, demo_analyses: 0, answered: false, ...options };
}

function counts(overrides: Partial<BetaActivationCounts> = {}): BetaActivationCounts {
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

interface SqlFragment {
  strings: readonly string[];
  values: unknown[];
}

function isSqlFragment(value: unknown): value is SqlFragment {
  return typeof value === 'object' && value !== null && 'strings' in value && 'values' in value;
}

/** Texto da consulta com os fragmentos aninhados no lugar e `?` nos valores. */
function renderSql(strings: readonly string[], values: unknown[]): string {
  return strings.reduce((sql, part, index) => {
    if (index === 0) return part;
    const value = values[index - 1];
    return sql + (isSqlFragment(value) ? renderSql(value.strings, value.values) : '?') + part;
  }, '');
}

/** Valores ligados da consulta, inclusive os de fragmentos `Prisma.sql` aninhados. */
function boundValues(values: unknown[]): unknown[] {
  return values.flatMap((value) => (isSqlFragment(value) ? boundValues(value.values) : [value]));
}

describe('painel semanal do beta (CC-705)', () => {
  describe('summarizeUsage', () => {
    it('counts as active whoever analysed or answered a real case, never the demo alone', () => {
      const usage = summarizeUsage([
        usageRow(3),
        usageRow(1, { demo_analyses: 1 }),
        usageRow(0, { answered: true }), // respondeu, mas a análise não saiu
        usageRow(0, { demo_analyses: 2 }), // só o caso de exemplo
        usageRow(12),
      ]);

      expect(usage).toEqual({
        activePhysicians: 4,
        physiciansWithAnalysis: 3,
        analyses: 16,
        demoAnalyses: 3,
        analysesPerPhysician: { mean: 4, median: 2 },
        distribution: [
          { bucket: '0', physicians: 1 },
          { bucket: '1', physicians: 1 },
          { bucket: '2-4', physicians: 1 },
          { bucket: '5-9', physicians: 0 },
          { bucket: '10+', physicians: 1 },
        ],
      });
    });

    it('has no average without active physicians', () => {
      const usage = summarizeUsage([usageRow(0, { demo_analyses: 1 })]);
      expect(usage.activePhysicians).toBe(0);
      expect(usage.analysesPerPhysician).toEqual({ mean: null, median: null });
      expect(usage.distribution.every((entry) => entry.physicians === 0)).toBe(true);
    });
  });

  describe('summarizeFeedback', () => {
    it('sums the negative kinds per 100 analyses and keeps "helpful" apart', () => {
      const feedback = summarizeFeedback(
        [
          { kind: 'wrong_scenario', count: 2 },
          { kind: 'wrong_recommendation', count: 1 },
          { kind: 'helpful', count: 5 },
        ],
        41,
      );
      expect(feedback).toEqual({
        negative: 3,
        helpful: 5,
        byKind: { wrong_scenario: 2, missing_coverage: 0, wrong_recommendation: 1, helpful: 5 },
        negativePer100Analyses: 7.3,
      });
    });

    it('has no rate without analyses', () => {
      expect(summarizeFeedback([], 0).negativePer100Analyses).toBeNull();
    });
  });

  describe('rankGaps', () => {
    it('ranks syndromes by gaps this week, with last week alongside', () => {
      const gaps = rankGaps(
        [
          { syndrome: null, count: 3 },
          { syndrome: 'febre', count: 1 },
          { syndrome: 'dor-toracica', count: 3 },
          { syndrome: 'dispneia', count: 2 },
          { syndrome: 'cefaleia', count: 1 },
          { syndrome: 'vertigem', count: 1 },
          { syndrome: 'choque', count: 1 },
        ],
        [
          { syndrome: 'dor-toracica', count: 1 },
          { syndrome: 'intoxicacao', count: 4 },
        ],
      );

      expect(gaps.total).toEqual({ current: 12, previous: 5 });
      expect(gaps.top).toEqual([
        { syndrome: 'dor-toracica', current: 3, previous: 1 },
        { syndrome: null, current: 3, previous: 0 },
        { syndrome: 'dispneia', current: 2, previous: 0 },
        { syndrome: 'cefaleia', current: 1, previous: 0 },
        { syndrome: 'choque', current: 1, previous: 0 },
      ]);
    });
  });

  describe('report', () => {
    function buildSubject() {
      const rawCalls: { sql: string; values: unknown[] }[] = [];
      const queryRaw = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = renderSql(strings, values);
        const bound = boundValues(values);
        rawCalls.push({ sql, values: bound });
        const current = bound.includes(CURRENT_FROM);
        if (sql.includes('intake_answers')) {
          return Promise.resolve(
            current ? [usageRow(4), usageRow(2, { demo_analyses: 1 })] : [usageRow(2)],
          );
        }
        if (sql.includes('FROM copilot_feedback')) {
          return Promise.resolve(current ? [{ kind: 'missing_coverage', count: 1 }] : []);
        }
        if (sql.includes('FROM knowledge_gaps')) {
          return Promise.resolve(
            current
              ? [{ syndrome: 'febre', count: 2 }]
              : [
                  { syndrome: 'febre', count: 1 },
                  { syndrome: 'cefaleia', count: 1 },
                ],
          );
        }
        return Promise.reject(new Error(`consulta inesperada: ${sql}`));
      });
      const aiCalls = {
        getAnalysisSummary: vi.fn((from: Date) =>
          Promise.resolve({
            count: from.toISOString() === CURRENT_FROM ? 6 : 2,
            totalCostUsd: 1.2,
            avgCostUsd: 0.2,
            latency: { p50Ms: 30_000, p95Ms: 61_000 },
          }),
        ),
      };
      const activation = {
        reportBetween: vi.fn((from: Date) =>
          Promise.resolve({
            overall: counts(
              from.toISOString() === CURRENT_FROM
                ? { registered: 3, eligible: 2, activated24h: 1, rate: 0.5 }
                : { registered: 1, eligible: 1, activated24h: 1, rate: 1 },
            ),
            byBatch: [],
          }),
        ),
      };
      const service = new BetaWeeklyService(
        { $queryRaw: queryRaw } as unknown as PrismaService,
        aiCalls as unknown as AiCallReportService,
        activation as unknown as BetaActivationService,
      );
      return { service, rawCalls, aiCalls, activation };
    }

    it('measures the week and the previous one up to the same point, with the markdown', async () => {
      const { service, aiCalls, activation } = buildSubject();

      const report = await service.report(undefined, NOW);

      expect(report.period).toEqual({
        current: {
          weekStart: '2026-10-12',
          weekEnd: '2026-10-18',
          from: CURRENT_FROM,
          to: NOW.toISOString(),
        },
        previous: {
          weekStart: '2026-10-05',
          weekEnd: '2026-10-11',
          from: PREVIOUS_FROM,
          to: '2026-10-09T16:00:00.000Z',
        },
        inProgress: true,
      });
      expect(report.usage.current).toMatchObject({
        activePhysicians: 2,
        analyses: 6,
        demoAnalyses: 1,
      });
      expect(report.usage.previous).toMatchObject({ activePhysicians: 1, analyses: 2 });
      expect(report.feedback.current.negativePer100Analyses).toBe(16.7);
      expect(report.feedback.previous.negativePer100Analyses).toBe(0);
      expect(report.knowledgeGaps).toEqual({
        total: { current: 2, previous: 2 },
        top: [{ syndrome: 'febre', current: 2, previous: 1 }],
      });
      expect(report.aiCost.current.count).toBe(6);
      expect(report.activation.target).toBe(0.7);
      expect(report.activation.current.overall.rate).toBe(0.5);
      expect(report.markdown).toContain('## Beta · semana de 12/10 a 18/10/2026');

      expect(aiCalls.getAnalysisSummary).toHaveBeenCalledWith(new Date(CURRENT_FROM), NOW);
      expect(aiCalls.getAnalysisSummary).toHaveBeenCalledWith(
        new Date(PREVIOUS_FROM),
        new Date('2026-10-09T16:00:00.000Z'),
      );
      expect(activation.reportBetween).toHaveBeenCalledWith(new Date(CURRENT_FROM), NOW, NOW);
    });

    it('marks what the database does not have yet as unavailable, with the source story', async () => {
      const { service } = buildSubject();
      const report = await service.report(undefined, NOW);

      expect(report.cardUsage).toMatchObject({ available: false, source: 'CC-408' });
      expect(report.toolUsage).toMatchObject({ available: false, source: 'CC-304' });
      expect(report.mentorship).toMatchObject({ available: false, source: 'CC-707' });
    });

    it('binds the window bounds as ISO text, independent of the session time zone', async () => {
      const { service, rawCalls } = buildSubject();
      await service.report('2026-10-07', NOW);

      expect(rawCalls).toHaveLength(6);
      for (const call of rawCalls) {
        expect(call.sql).toContain("::timestamptz AT TIME ZONE 'UTC'");
      }
      const bounds = rawCalls.flatMap((call) => call.values);
      expect(bounds).toEqual(
        expect.arrayContaining([
          '2026-10-05T03:00:00.000Z',
          '2026-10-12T03:00:00.000Z',
          '2026-09-28T03:00:00.000Z',
        ]),
      );
    });

    it('refuses a future week with 400', async () => {
      const { service } = buildSubject();
      await expect(service.report('2026-10-19', NOW)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

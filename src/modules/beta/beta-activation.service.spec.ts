import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../config/prisma.service';
import {
  BetaActivationService,
  countActivation,
  type ActivationRow,
} from './beta-activation.service';

const now = new Date('2026-10-20T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function row(
  hoursAgo: number,
  firstAnalysisAfterHours: number | null,
  options: { batch?: string | null; demoOnly?: boolean } = {},
): ActivationRow {
  const createdAt = new Date(now.getTime() - hoursAgo * HOUR);
  const firstAnalysis =
    firstAnalysisAfterHours === null
      ? null
      : new Date(createdAt.getTime() + firstAnalysisAfterHours * HOUR);
  return {
    physician_id: `p-${hoursAgo}-${firstAnalysisAfterHours}`,
    created_at: createdAt,
    batch_label: options.batch ?? null,
    first_analysis_at: firstAnalysis,
    first_real_analysis_at: options.demoOnly ? null : firstAnalysis,
  };
}

describe('ativação do beta (CC-702)', () => {
  it('counts the first analysis within 24 h over accounts with 24 h complete', () => {
    const counts = countActivation(
      [
        row(72, 2), // ativou
        row(72, 23.9), // ativou no limite
        row(72, 30), // analisou, mas depois de 24 h
        row(48, null), // nunca analisou
        row(5, 1), // ainda dentro das 24 h: fora da taxa
      ],
      now,
    );

    expect(counts).toEqual({
      registered: 5,
      eligible: 4,
      activated24h: 2,
      activatedRealCase24h: 2,
      rate: 0.5,
      realCaseRate: 0.5,
    });
  });

  it('separates whoever only ran the example case from real use', () => {
    const counts = countActivation([row(48, 1, { demoOnly: true }), row(48, 2)], now);
    expect(counts).toMatchObject({ activated24h: 2, activatedRealCase24h: 1, realCaseRate: 0.5 });
  });

  it('has no rate without eligible accounts', () => {
    expect(countActivation([row(2, 1)], now)).toMatchObject({
      registered: 1,
      eligible: 0,
      rate: null,
      realCaseRate: null,
    });
  });

  it('reports overall and per invite batch, with null for sign-ups without invite', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([
        row(48, 1, { batch: 'rede Ripardo' }),
        row(48, null, { batch: 'rede Ripardo' }),
        row(48, 3, { batch: 'base ANY' }),
        row(48, 2),
      ]);
    const service = new BetaActivationService({ $queryRaw: queryRaw } as unknown as PrismaService);

    const report = await service.report(30, now);

    expect(report.days).toBe(30);
    expect(report.target).toBe(0.7);
    expect(report.overall).toMatchObject({
      registered: 4,
      eligible: 4,
      activated24h: 3,
      rate: 0.75,
    });
    expect(report.byBatch[0]).toMatchObject({
      batchLabel: 'rede Ripardo',
      registered: 2,
      rate: 0.5,
    });
    expect(report.byBatch.map((batch) => batch.batchLabel)).toEqual(
      expect.arrayContaining([null, 'base ANY']),
    );
    // A janela vai como texto ISO para o SQL (sem depender do fuso da sessão).
    const values = queryRaw.mock.calls[0]!.slice(1);
    expect(values).toContain('2026-09-20T12:00:00.000Z');
  });
});

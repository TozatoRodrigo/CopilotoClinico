import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@sentry/node', () => ({
  captureMessage: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { FunnelAbandonmentCronService } from './funnel-abandonment-cron.service';
import { ProductFunnelService } from '../modules/analytics/product-funnel.service';
import type { ProductFunnel } from '../modules/analytics/product-funnel.types';

function funnelWith(abandonmentRate: number, encountersWithBlockers = 4): ProductFunnel {
  return {
    period: 'last1days',
    demoCase: null,
    decisionLoop: {
      analysesStarted: 10,
      encountersWithBlockers,
      blockerQuestionsEmitted: encountersWithBlockers,
      blockerQuestionsAnswered: 0,
      blockerAnswerRate: 0,
      reachedConduta: 0,
      avgTurnsToConduta: null,
      abandoned: Math.round(abandonmentRate * encountersWithBlockers),
      abandonmentRate,
      confirmedDocuments: 0,
      uncertaintyRate: 0,
    },
    activation: { registered: 0, withEncounter: 0, withAnalysis: 0, withConfirmation: 0 },
    generatedAt: new Date().toISOString(),
  };
}

describe('FunnelAbandonmentCronService', () => {
  let service: FunnelAbandonmentCronService;
  let funnelService: { getFunnel: ReturnType<typeof vi.fn> };
  let logger: { log: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let previousDsn: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    (Sentry.captureMessage as unknown as ReturnType<typeof vi.fn>).mockClear();
    funnelService = { getFunnel: vi.fn() };
    service = new FunnelAbandonmentCronService(funnelService as unknown as ProductFunnelService);
    logger = service['logger'] as unknown as typeof logger;
    logger.log = vi.fn();
    logger.debug = vi.fn();
    logger.warn = vi.fn();
    logger.error = vi.fn();
    previousDsn = process.env.SENTRY_DSN;
  });

  afterEach(() => {
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
  });

  it('alerts Sentry when abandonment exceeds the 30% threshold', async () => {
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
    funnelService.getFunnel.mockResolvedValue(funnelWith(0.5));

    await service.checkAbandonment();

    expect(Sentry.captureMessage).toHaveBeenCalledOnce();
    const call = (Sentry.captureMessage as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [message, opts] = call as [string, { level: string; extra: Record<string, unknown> }];
    expect(message).toContain('30%');
    expect(opts.level).toBe('warning');
    // LGPD-safe: payload carries only numbers.
    expect(JSON.stringify(opts.extra)).not.toContain('caseText');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('50%'));
  });

  it('does not alert when abandonment is below the threshold', async () => {
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
    funnelService.getFunnel.mockResolvedValue(funnelWith(0.1));

    await service.checkAbandonment();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('skips alerting when no encounters emitted blockers yet', async () => {
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
    funnelService.getFunnel.mockResolvedValue(funnelWith(0, 0));

    await service.checkAbandonment();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('does not call Sentry when SENTRY_DSN is unset (still warns in logs)', async () => {
    delete process.env.SENTRY_DSN;
    funnelService.getFunnel.mockResolvedValue(funnelWith(0.5));

    await service.checkAbandonment();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs unexpected exceptions as errors', async () => {
    funnelService.getFunnel.mockRejectedValue(new Error('db down'));

    await service.checkAbandonment();

    expect(logger.error).toHaveBeenCalledWith(
      'Funnel abandonment check failed with exception: db down',
      expect.any(String),
    );
  });
});

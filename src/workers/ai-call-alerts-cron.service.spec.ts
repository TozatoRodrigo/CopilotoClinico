import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/node', () => ({
  captureMessage: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import type { ConfigService } from '@nestjs/config';
import { AiCallAlertsCronService, DECISION_P95_MIN_CALLS } from './ai-call-alerts-cron.service';
import type { AiCallReportService } from '../modules/analytics/ai-call-report.service';
import type { RedisService } from '../modules/redis/redis.service';

const captureMessage = Sentry.captureMessage as unknown as ReturnType<typeof vi.fn>;

const MORNING = new Date('2026-10-14T09:02:00.000Z');

/** Redis de mentira: guarda as chaves entre instâncias do cron (o "restart"). */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
}

interface Measures {
  cost?: { calls: number; totalCostUsd: number };
  decision?: { calls: number; p95Ms: number | null };
  usageLimit?: Array<{ provider: string; calls: number }>;
}

function buildSubject({
  env = {},
  measures = {},
  redis = fakeRedis(),
}: {
  env?: Record<string, string>;
  measures?: Measures;
  redis?: ReturnType<typeof fakeRedis>;
} = {}) {
  const report = {
    getCostSince: vi.fn().mockResolvedValue(measures.cost ?? { calls: 0, totalCostUsd: 0 }),
    getStageLatencyP95Since: vi
      .fn()
      .mockResolvedValue(measures.decision ?? { calls: 0, p95Ms: null }),
    getUsageLimitErrorsSince: vi.fn().mockResolvedValue(measures.usageLimit ?? []),
  };
  const config = { get: vi.fn((key: string) => env[key]) };
  const service = new AiCallAlertsCronService(
    report as unknown as AiCallReportService,
    config as unknown as ConfigService,
    redis as unknown as RedisService,
  );
  const logger = service['logger'] as unknown as {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  logger.error = vi.fn();
  logger.warn = vi.fn();
  return { logger, redis, report, service };
}

describe('AiCallAlertsCronService (CC-005)', () => {
  let previousDsn: string | undefined;

  beforeEach(() => {
    captureMessage.mockClear();
    previousDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
  });

  afterEach(() => {
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
  });

  describe('custo do dia (AI_DAILY_COST_ALERT_USD)', () => {
    const env = { AI_DAILY_COST_ALERT_USD: '20' };

    it('sem a variável, o custo nem é consultado', async () => {
      const { report, service } = buildSubject({
        measures: { cost: { calls: 900, totalCostUsd: 500 } },
      });

      await service.runChecks(MORNING);

      expect(report.getCostSince).not.toHaveBeenCalled();
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('soma desde a meia-noite UTC e alerta quando passa do teto', async () => {
      const { logger, report, service } = buildSubject({
        env,
        measures: { cost: { calls: 1234, totalCostUsd: 23.456 } },
      });

      await service.runChecks(MORNING);

      expect(report.getCostSince).toHaveBeenCalledWith(new Date('2026-10-14T00:00:00.000Z'));
      expect(logger.error).toHaveBeenCalledWith(
        'AI_DAILY_COST_ALERT day=2026-10-14 costUsd=23.46 thresholdUsd=20 calls=1234',
      );
      expect(captureMessage).toHaveBeenCalledWith('AI_DAILY_COST_ALERT', {
        level: 'warning',
        tags: { component: 'ai-gateway', check: 'ai-call-daily-cost' },
        extra: { day: '2026-10-14', costUsd: 23.46, thresholdUsd: 20, calls: 1234 },
      });
    });

    it('igual ao teto não alerta', async () => {
      const { logger, service } = buildSubject({
        env,
        measures: { cost: { calls: 10, totalCostUsd: 20 } },
      });

      await service.runChecks(MORNING);

      expect(logger.error).not.toHaveBeenCalled();
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('alerta uma vez por dia: as verificações seguintes do mesmo dia ficam quietas', async () => {
      const { service } = buildSubject({
        env,
        measures: { cost: { calls: 10, totalCostUsd: 25 } },
      });

      await service.runChecks(MORNING);
      await service.runChecks(new Date('2026-10-14T09:07:00.000Z'));
      await service.runChecks(new Date('2026-10-14T23:55:00.000Z'));
      expect(captureMessage).toHaveBeenCalledTimes(1);

      await service.runChecks(new Date('2026-10-15T00:05:00.000Z'));
      expect(captureMessage).toHaveBeenCalledTimes(2);
      expect(captureMessage).toHaveBeenLastCalledWith(
        'AI_DAILY_COST_ALERT',
        expect.objectContaining({ extra: expect.objectContaining({ day: '2026-10-15' }) }),
      );
    });

    it('o "já avisei" sobrevive a um restart pelo Redis', async () => {
      const redis = fakeRedis();
      const measures = { cost: { calls: 10, totalCostUsd: 25 } };

      await buildSubject({ env, measures, redis }).service.runChecks(MORNING);
      const afterRestart = buildSubject({ env, measures, redis });
      await afterRestart.service.runChecks(new Date('2026-10-14T10:00:00.000Z'));

      expect(captureMessage).toHaveBeenCalledTimes(1);
      expect(afterRestart.logger.error).not.toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        'ai-call-alert:daily-cost:2026-10-14',
        MORNING.toISOString(),
        26 * 60 * 60,
      );
    });

    it('sem Redis, a memória ainda segura a repetição', async () => {
      const redis = fakeRedis();
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      const { service } = buildSubject({
        env,
        measures: { cost: { calls: 10, totalCostUsd: 25 } },
        redis,
      });

      await service.runChecks(MORNING);
      await service.runChecks(new Date('2026-10-14T09:07:00.000Z'));

      expect(captureMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('p95 da decisão na última hora (AI_P95_ALERT_MS)', () => {
    const env = { AI_P95_ALERT_MS: '45000' };

    it('mede a etapa decision na última hora e alerta acima da meta', async () => {
      const { logger, report, service } = buildSubject({
        env,
        measures: { decision: { calls: 8, p95Ms: 61_000 } },
      });

      await service.runChecks(MORNING);

      expect(report.getStageLatencyP95Since).toHaveBeenCalledWith(
        'decision',
        new Date('2026-10-14T08:02:00.000Z'),
      );
      expect(logger.error).toHaveBeenCalledWith(
        'AI_DECISION_P95_ALERT p95Ms=61000 thresholdMs=45000 calls=8 windowMinutes=60',
      );
      expect(captureMessage).toHaveBeenCalledWith('AI_DECISION_P95_ALERT', {
        level: 'warning',
        tags: { component: 'ai-gateway', check: 'ai-call-decision-p95' },
        extra: { p95Ms: 61_000, thresholdMs: 45_000, calls: 8, windowMinutes: 60 },
      });
    });

    it(`com menos de ${DECISION_P95_MIN_CALLS} chamadas na hora não alerta`, async () => {
      const { service } = buildSubject({
        env,
        measures: { decision: { calls: DECISION_P95_MIN_CALLS - 1, p95Ms: 120_000 } },
      });

      await service.runChecks(MORNING);

      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('dentro da meta não alerta', async () => {
      const { service } = buildSubject({
        env,
        measures: { decision: { calls: 20, p95Ms: 45_000 } },
      });

      await service.runChecks(MORNING);

      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('alerta no máximo uma vez por hora', async () => {
      const { service } = buildSubject({
        env,
        measures: { decision: { calls: 8, p95Ms: 61_000 } },
      });

      await service.runChecks(MORNING);
      await service.runChecks(new Date('2026-10-14T09:57:00.000Z'));
      expect(captureMessage).toHaveBeenCalledTimes(1);

      await service.runChecks(new Date('2026-10-14T10:02:00.000Z'));
      expect(captureMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('limite de uso do provedor (sempre ligado)', () => {
    it('alerta como erro por provedor, só com contagens', async () => {
      const { logger, report, service } = buildSubject({
        measures: { usageLimit: [{ provider: 'anthropic', calls: 7 }] },
      });

      await service.runChecks(MORNING);

      expect(report.getUsageLimitErrorsSince).toHaveBeenCalledWith(
        new Date('2026-10-14T08:52:00.000Z'),
      );
      expect(logger.error).toHaveBeenCalledWith(
        'AI_PROVIDER_USAGE_LIMIT provider=anthropic calls=7 windowMinutes=10',
      );
      expect(captureMessage).toHaveBeenCalledWith('AI_PROVIDER_USAGE_LIMIT', {
        level: 'error',
        tags: { component: 'ai-gateway', check: 'ai-call-usage-limit' },
        extra: { provider: 'anthropic', calls: 7, windowMinutes: 10 },
      });
    });

    it('repete de hora em hora enquanto o bloqueio durar', async () => {
      const { service } = buildSubject({
        measures: { usageLimit: [{ provider: 'anthropic', calls: 3 }] },
      });

      await service.runChecks(MORNING);
      await service.runChecks(new Date('2026-10-14T09:07:00.000Z'));
      await service.runChecks(new Date('2026-10-14T10:02:00.000Z'));

      expect(captureMessage).toHaveBeenCalledTimes(2);
    });

    it('sem chamada bloqueada fica quieto', async () => {
      const { logger, service } = buildSubject();

      await service.runChecks(MORNING);

      expect(logger.error).not.toHaveBeenCalled();
      expect(captureMessage).not.toHaveBeenCalled();
    });
  });

  it('sem SENTRY_DSN o alerta fica só no log', async () => {
    delete process.env.SENTRY_DSN;
    const { logger, service } = buildSubject({
      env: { AI_DAILY_COST_ALERT_USD: '1' },
      measures: { cost: { calls: 10, totalCostUsd: 5 } },
    });

    await service.runChecks(MORNING);

    expect(logger.error).toHaveBeenCalledOnce();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('limiar inválido desliga o alerta e avisa uma vez', async () => {
    const { logger, report, service } = buildSubject({
      env: { AI_DAILY_COST_ALERT_USD: 'vinte', AI_P95_ALERT_MS: '-1' },
    });

    await service.runChecks(MORNING);
    await service.runChecks(new Date('2026-10-14T09:07:00.000Z'));

    expect(report.getCostSince).not.toHaveBeenCalled();
    expect(report.getStageLatencyP95Since).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'AI_CALL_ALERT_THRESHOLD_INVALID key=AI_DAILY_COST_ALERT_USD: alerta desligado',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'AI_CALL_ALERT_THRESHOLD_INVALID key=AI_P95_ALERT_MS: alerta desligado',
    );
  });

  it('uma verificação que falha não impede as outras', async () => {
    const { logger, report, service } = buildSubject({
      env: { AI_DAILY_COST_ALERT_USD: '1', AI_P95_ALERT_MS: '1000' },
      measures: { cost: { calls: 10, totalCostUsd: 5 } },
    });
    report.getUsageLimitErrorsSince.mockRejectedValue(new Error('database unavailable'));

    await service.runChecks(MORNING);

    expect(logger.error).toHaveBeenCalledWith(
      'AI_CALL_ALERT_CHECK_FAILED check=usage-limit reason=Error: database unavailable',
      expect.any(String),
    );
    expect(report.getStageLatencyP95Since).toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith('AI_DAILY_COST_ALERT', expect.anything());
  });
});

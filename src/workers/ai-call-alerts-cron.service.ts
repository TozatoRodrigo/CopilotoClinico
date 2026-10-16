import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { AiCallReportService } from '../modules/analytics/ai-call-report.service';
import { readAiCallAlertThresholds } from '../modules/analytics/ai-call-alerts.settings';
import { RedisService } from '../modules/redis/redis.service';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Janela do p95 da decisão: a última hora. */
const DECISION_P95_WINDOW_MS = HOUR_MS;

/**
 * Com menos chamadas que isto na hora, o "p95" é só a chamada mais lenta: uma
 * análise demorada isolada não vira alerta.
 */
export const DECISION_P95_MIN_CALLS = 3;

/** Cobre o intervalo entre duas verificações (5 min), com folga. */
const USAGE_LIMIT_WINDOW_MS = 10 * MINUTE_MS;

const DAY_TTL_SECONDS = 26 * 60 * 60;
const HOUR_TTL_SECONDS = 2 * 60 * 60;

type AlertLevel = 'error' | 'warning';

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** "2026-10-14T15": a hora UTC, chave do alerta que se repete de hora em hora. */
function utcHour(now: Date): string {
  return now.toISOString().slice(0, 13);
}

function errorName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * CC-005 — alertas de custo e latência a partir de `ai_calls`, a cada 5 min:
 *
 * - custo do dia (UTC) acima de `AI_DAILY_COST_ALERT_USD`: uma vez por dia;
 * - p95 da etapa `decision` na última hora acima de `AI_P95_ALERT_MS`: uma
 *   vez por hora;
 * - chamada recusada pelo provedor por limite de uso ou falta de crédito:
 *   sempre ligado (a análise para até alguém agir), uma vez por hora e
 *   provedor.
 *
 * Mesmo mecanismo da cadeia de auditoria: linha ERROR no log e, com
 * SENTRY_DSN, mensagem no Sentry. Só números, etapa e provedor: nenhum texto
 * do caso nem a mensagem do provedor. O "já avisei" fica no Redis para
 * sobreviver a um restart, e em memória para quando o Redis não responde.
 */
@Injectable()
export class AiCallAlertsCronService {
  private readonly logger = new Logger(AiCallAlertsCronService.name);
  /** Chave do alerta → quando expira (ms). */
  private readonly fired = new Map<string, number>();
  private readonly warnedInvalidKeys = new Set<string>();

  constructor(
    @Inject(AiCallReportService) private readonly report: AiCallReportService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Cron('*/5 * * * *', { name: 'ai-call-alerts', timeZone: 'UTC' })
  async checkAiCalls(): Promise<void> {
    await this.runChecks(new Date());
  }

  async runChecks(now: Date): Promise<void> {
    const { thresholds, invalidKeys } = readAiCallAlertThresholds(this.config);
    for (const key of invalidKeys) {
      if (this.warnedInvalidKeys.has(key)) continue;
      this.warnedInvalidKeys.add(key);
      this.logger.warn(`AI_CALL_ALERT_THRESHOLD_INVALID key=${key}: alerta desligado`);
    }

    await this.guarded('usage-limit', () => this.checkUsageLimit(now));
    if (thresholds.dailyCostUsd !== null) {
      const threshold = thresholds.dailyCostUsd;
      await this.guarded('daily-cost', () => this.checkDailyCost(now, threshold));
    }
    if (thresholds.decisionP95Ms !== null) {
      const threshold = thresholds.decisionP95Ms;
      await this.guarded('decision-p95', () => this.checkDecisionLatency(now, threshold));
    }
  }

  private async checkUsageLimit(now: Date): Promise<void> {
    const since = new Date(now.getTime() - USAGE_LIMIT_WINDOW_MS);
    const rows = await this.report.getUsageLimitErrorsSince(since);
    for (const { provider, calls } of rows) {
      if (
        !(await this.firstTime(`usage-limit:${provider}:${utcHour(now)}`, HOUR_TTL_SECONDS, now))
      ) {
        continue;
      }
      this.logger.error(
        `AI_PROVIDER_USAGE_LIMIT provider=${provider} calls=${calls} windowMinutes=${USAGE_LIMIT_WINDOW_MS / MINUTE_MS}`,
      );
      this.notify('AI_PROVIDER_USAGE_LIMIT', 'error', 'usage-limit', {
        provider,
        calls,
        windowMinutes: USAGE_LIMIT_WINDOW_MS / MINUTE_MS,
      });
    }
  }

  private async checkDailyCost(now: Date, thresholdUsd: number): Promise<void> {
    const day = utcDay(now);
    const { calls, totalCostUsd } = await this.report.getCostSince(
      new Date(`${day}T00:00:00.000Z`),
    );
    if (totalCostUsd <= thresholdUsd) return;
    if (!(await this.firstTime(`daily-cost:${day}`, DAY_TTL_SECONDS, now))) return;

    const costUsd = Math.round(totalCostUsd * 100) / 100;
    this.logger.error(
      `AI_DAILY_COST_ALERT day=${day} costUsd=${costUsd} thresholdUsd=${thresholdUsd} calls=${calls}`,
    );
    this.notify('AI_DAILY_COST_ALERT', 'warning', 'daily-cost', {
      day,
      costUsd,
      thresholdUsd,
      calls,
    });
  }

  private async checkDecisionLatency(now: Date, thresholdMs: number): Promise<void> {
    const since = new Date(now.getTime() - DECISION_P95_WINDOW_MS);
    const { calls, p95Ms } = await this.report.getStageLatencyP95Since('decision', since);
    if (calls < DECISION_P95_MIN_CALLS || p95Ms === null || p95Ms <= thresholdMs) return;
    if (!(await this.firstTime(`decision-p95:${utcHour(now)}`, HOUR_TTL_SECONDS, now))) return;

    this.logger.error(
      `AI_DECISION_P95_ALERT p95Ms=${p95Ms} thresholdMs=${thresholdMs} calls=${calls} windowMinutes=60`,
    );
    this.notify('AI_DECISION_P95_ALERT', 'warning', 'decision-p95', {
      p95Ms,
      thresholdMs,
      calls,
      windowMinutes: 60,
    });
  }

  private notify(
    message: string,
    level: AlertLevel,
    check: string,
    extra: Record<string, string | number>,
  ): void {
    if (!process.env.SENTRY_DSN) return;
    Sentry.captureMessage(message, {
      level,
      tags: { component: 'ai-gateway', check: `ai-call-${check}` },
      extra,
    });
  }

  /** Uma verificação que falha não impede as outras nem derruba o cron. */
  private async guarded(check: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error: unknown) {
      this.logger.error(
        `AI_CALL_ALERT_CHECK_FAILED check=${check} reason=${errorName(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** `true` só na primeira vez que a chave aparece dentro do TTL. */
  private async firstTime(key: string, ttlSeconds: number, now: Date): Promise<boolean> {
    const nowMs = now.getTime();
    for (const [firedKey, expiresAt] of this.fired) {
      if (expiresAt <= nowMs) this.fired.delete(firedKey);
    }
    if (this.fired.has(key)) return false;

    const expiresAt = nowMs + ttlSeconds * 1000;
    const redisKey = `ai-call-alert:${key}`;
    if ((await this.redis.get(redisKey)) !== null) {
      this.fired.set(key, expiresAt);
      return false;
    }
    this.fired.set(key, expiresAt);
    await this.redis.set(redisKey, now.toISOString(), ttlSeconds);
    return true;
  }
}

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { BETA_ACTIVATION_TARGET } from '../../shared/contracts/beta';
import {
  BETA_ANALYSES_BUCKETS,
  BETA_WEEKLY_TOP_GAPS,
  type BetaAnalysesBucket,
  type BetaWeeklyActivationWeek,
  type BetaWeeklyFeedback,
  type BetaWeeklyGaps,
  type BetaWeeklyReport,
  type BetaWeeklyUnavailable,
  type BetaWeeklyUsage,
} from '../../shared/contracts/beta-weekly';
import type { AiCallAnalysisSummary } from '../../shared/contracts/ai-calls';
import type { CopilotFeedbackKind } from '../../shared/contracts/clinical';
import { AiCallReportService } from '../analytics/ai-call-report.service';
import { BetaActivationService } from './beta-activation.service';
import { FutureBetaWeekError, resolveBetaWeek, toWeekRange, type WeekWindow } from './beta-week';
import { renderBetaWeeklyMarkdown } from './beta-weekly-markdown';

/** Uma linha por médico com uso na semana. Só contagens: o id não sai do banco. */
export interface PhysicianUsageRow {
  analyses: number;
  demo_analyses: number;
  answered: boolean;
}

export interface FeedbackKindRow {
  kind: CopilotFeedbackKind;
  count: number;
}

export interface GapSyndromeRow {
  syndrome: string | null;
  count: number;
}

interface WeekMeasures {
  usage: BetaWeeklyUsage;
  feedback: BetaWeeklyFeedback;
  gaps: GapSyndromeRow[];
  aiCost: AiCallAnalysisSummary;
  activation: BetaWeeklyActivationWeek;
}

/**
 * Números que o banco desta versão não tem. Cada constante é o ponto de
 * extensão da história que traz o dado: troque-a pela contagem quando ela
 * existir; a tela e a ata já mostram o caso `available: true`.
 */
export const CARD_USAGE_PENDING: BetaWeeklyUnavailable = {
  available: false,
  reason:
    'A decisão ainda não usa cartões revisados, então a análise não registra cartão aplicado.',
  source: 'CC-408',
};

export const TOOL_USAGE_PENDING: BetaWeeklyUnavailable = {
  available: false,
  reason:
    'A área Ferramentas ainda não existe. Os eventos de ferramenta (CC-704) vão para o Umami, não para o banco: para entrar aqui, o uso precisa ser gravado no servidor.',
  source: 'CC-304',
};

export const MENTORSHIP_PENDING: BetaWeeklyUnavailable = {
  available: false,
  reason: 'Os pedidos de mentoria ainda não são gravados.',
  source: 'CC-707',
};

const NEGATIVE_FEEDBACK_KINDS = [
  'wrong_scenario',
  'missing_coverage',
  'wrong_recommendation',
] as const satisfies readonly CopilotFeedbackKind[];

const round1 = (value: number): number => Math.round(value * 10) / 10;

function bucketOf(analyses: number): BetaAnalysesBucket {
  if (analyses === 0) return '0';
  if (analyses === 1) return '1';
  if (analyses <= 4) return '2-4';
  if (analyses <= 9) return '5-9';
  return '10+';
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Ativo = análise concluída de caso real ou pergunta respondida em caso real.
 * Quem só rodou o caso de exemplo do onboarding não conta (aparece em
 * `demoAnalyses`): o painel mede uso no plantão.
 */
export function summarizeUsage(rows: PhysicianUsageRow[]): BetaWeeklyUsage {
  const active = rows.filter((row) => row.analyses > 0 || row.answered);
  const counts = active.map((row) => row.analyses).sort((a, b) => a - b);
  const analyses = counts.reduce((sum, count) => sum + count, 0);

  const perBucket = new Map<BetaAnalysesBucket, number>();
  for (const count of counts) {
    const bucket = bucketOf(count);
    perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + 1);
  }

  return {
    activePhysicians: active.length,
    physiciansWithAnalysis: counts.filter((count) => count > 0).length,
    analyses,
    demoAnalyses: rows.reduce((sum, row) => sum + row.demo_analyses, 0),
    analysesPerPhysician: {
      mean: active.length > 0 ? round1(analyses / active.length) : null,
      median: median(counts),
    },
    distribution: BETA_ANALYSES_BUCKETS.map((bucket) => ({
      bucket,
      physicians: perBucket.get(bucket) ?? 0,
    })),
  };
}

export function summarizeFeedback(rows: FeedbackKindRow[], analyses: number): BetaWeeklyFeedback {
  const byKind: Record<CopilotFeedbackKind, number> = {
    wrong_scenario: 0,
    missing_coverage: 0,
    wrong_recommendation: 0,
    helpful: 0,
  };
  for (const row of rows) byKind[row.kind] += row.count;

  const negative = NEGATIVE_FEEDBACK_KINDS.reduce((sum, kind) => sum + byKind[kind], 0);
  return {
    negative,
    helpful: byKind.helpful,
    byKind,
    negativePer100Analyses: analyses > 0 ? round1((negative / analyses) * 100) : null,
  };
}

/** As síndromes com mais lacunas na semana, com a contagem da anterior ao lado. */
export function rankGaps(current: GapSyndromeRow[], previous: GapSyndromeRow[]): BetaWeeklyGaps {
  const previousBySyndrome = new Map(previous.map((row) => [row.syndrome, row.count]));
  const total = (rows: GapSyndromeRow[]) => rows.reduce((sum, row) => sum + row.count, 0);

  const top = current
    .filter((row) => row.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        // Sem síndrome registrada vai por último no empate: é a lacuna menos acionável.
        (a.syndrome === null ? 1 : 0) - (b.syndrome === null ? 1 : 0) ||
        (a.syndrome ?? '').localeCompare(b.syndrome ?? ''),
    )
    .slice(0, BETA_WEEKLY_TOP_GAPS)
    .map((row) => ({
      syndrome: row.syndrome,
      current: row.count,
      previous: previousBySyndrome.get(row.syndrome) ?? 0,
    }));

  return { total: { current: total(current), previous: total(previous) }, top };
}

/** Coluna `timestamp` sem fuso (gravada em UTC): o limite vai como texto ISO convertido para UTC. */
function utcTimestamp(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

/**
 * CC-705 — painel semanal do beta: os números da reunião de sexta (CC-706)
 * para a semana pedida e a anterior, mais o resumo em markdown para a ata.
 *
 * Fontes: `ai_interactions` e `case_intakes` (uso), `copilot_feedback`,
 * `knowledge_gaps` (CC-703), `ai_calls` pelo serviço da CC-004 e a ativação
 * da CC-702. Médico só entra agregado: as consultas devolvem contagens, sem
 * id, e nada do caso é lido além dos campos estruturais.
 */
@Injectable()
export class BetaWeeklyService {
  private readonly logger = new Logger(BetaWeeklyService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiCallReportService) private readonly aiCalls: AiCallReportService,
    @Inject(BetaActivationService) private readonly activation: BetaActivationService,
  ) {}

  async report(week: string | undefined, now: Date = new Date()): Promise<BetaWeeklyReport> {
    let period: ReturnType<typeof resolveBetaWeek>;
    try {
      period = resolveBetaWeek(week, now);
    } catch (error) {
      if (error instanceof FutureBetaWeekError) throw new BadRequestException(error.message);
      throw error;
    }

    const startedAt = Date.now();
    const [current, previous] = await Promise.all([
      this.measure(period.current, now),
      this.measure(period.previous, now),
    ]);

    const report: Omit<BetaWeeklyReport, 'markdown'> = {
      period: {
        current: toWeekRange(period.current),
        previous: toWeekRange(period.previous),
        inProgress: period.inProgress,
      },
      usage: { current: current.usage, previous: previous.usage },
      feedback: { current: current.feedback, previous: previous.feedback },
      aiCost: { current: current.aiCost, previous: previous.aiCost },
      cardUsage: CARD_USAGE_PENDING,
      toolUsage: TOOL_USAGE_PENDING,
      mentorship: MENTORSHIP_PENDING,
      knowledgeGaps: rankGaps(current.gaps, previous.gaps),
      activation: {
        target: BETA_ACTIVATION_TARGET,
        current: current.activation,
        previous: previous.activation,
      },
      generatedAt: now.toISOString(),
    };

    this.logger.log(
      `BETA_WEEKLY_REPORT week=${period.current.weekStart} inProgress=${period.inProgress} ` +
        `activePhysicians=${current.usage.activePhysicians} analyses=${current.usage.analyses} ` +
        `durationMs=${Date.now() - startedAt}`,
    );

    return { ...report, markdown: renderBetaWeeklyMarkdown(report) };
  }

  private async measure(window: WeekWindow, now: Date): Promise<WeekMeasures> {
    const [usageRows, feedbackRows, gaps, aiCost, activation] = await Promise.all([
      this.queryUsage(window),
      this.queryFeedback(window),
      this.queryGaps(window),
      this.aiCalls.getAnalysisSummary(window.from, window.to),
      this.activation.reportBetween(window.from, window.to, now),
    ]);
    const usage = summarizeUsage(usageRows);
    return {
      usage,
      feedback: summarizeFeedback(feedbackRows, usage.analyses),
      gaps,
      aiCost,
      activation,
    };
  }

  /**
   * Por médico (papel PHYSICIAN): análises concluídas — sem as falhas de
   * validação, gravadas só para a trilha CFM — separadas em caso real e caso
   * de exemplo, e se respondeu alguma pergunta do Copiloto em caso real
   * (antes do plano, em `case_intakes.answers[].answeredAt`; depois do plano,
   * na reanálise com `answered_questions`).
   */
  private queryUsage({ from, to }: WeekWindow): Promise<PhysicianUsageRow[]> {
    const since = utcTimestamp(from);
    const until = utcTimestamp(to);
    return this.prisma.$queryRaw<PhysicianUsageRow[]>`
      WITH analyses AS (
        SELECT e.physician_id,
               count(*) FILTER (WHERE ai.params->>'demoCase' IS NULL)::int AS analyses,
               count(*) FILTER (WHERE ai.params->>'demoCase' IS NOT NULL)::int AS demo_analyses
        FROM ai_interactions ai
        JOIN encounters e ON e.id = ai.encounter_id
        WHERE ai.created_at >= ${since} AND ai.created_at < ${until}
          AND ai.raw_output -> 'validationErrors' IS NULL
        GROUP BY e.physician_id
      ),
      intake_answers AS (
        -- O CASE protege o cast: um answeredAt fora do formato não derruba o painel.
        SELECT ci.physician_id,
               CASE WHEN answer->>'answeredAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
                    THEN (answer->>'answeredAt')::timestamptz END AS answered_at
        FROM case_intakes ci
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(ci.answers) = 'array' THEN ci.answers ELSE '[]'::jsonb END
        ) AS answer
        -- Resposta nova atualiza a linha: updated_at poda as conversas antigas.
        WHERE ci.demo_case IS NULL AND ci.updated_at >= ${since}
      ),
      answered AS (
        SELECT physician_id
        FROM intake_answers
        WHERE answered_at >= ${from.toISOString()}::timestamptz
          AND answered_at < ${to.toISOString()}::timestamptz
        UNION
        SELECT e.physician_id
        FROM ai_interactions ai
        JOIN encounters e ON e.id = ai.encounter_id
        WHERE ai.created_at >= ${since} AND ai.created_at < ${until}
          AND ai.params->>'demoCase' IS NULL
          AND CASE WHEN jsonb_typeof(ai.answered_questions) = 'array'
                   THEN jsonb_array_length(ai.answered_questions) > 0
                   ELSE false END
      )
      SELECT coalesce(a.analyses, 0)::int AS analyses,
             coalesce(a.demo_analyses, 0)::int AS demo_analyses,
             (q.physician_id IS NOT NULL) AS answered
      FROM physicians p
      LEFT JOIN analyses a ON a.physician_id = p.id
      LEFT JOIN answered q ON q.physician_id = p.id
      WHERE p.role = 'PHYSICIAN'
        AND (a.physician_id IS NOT NULL OR q.physician_id IS NOT NULL)
    `;
  }

  /** Reportes de médicos (papel PHYSICIAN) sobre análises de caso real, por tipo. */
  private queryFeedback({ from, to }: WeekWindow): Promise<FeedbackKindRow[]> {
    return this.prisma.$queryRaw<FeedbackKindRow[]>`
      SELECT c.kind::text AS kind, count(*)::int AS count
      FROM copilot_feedback c
      JOIN physicians p ON p.id = c.physician_id
      JOIN ai_interactions ai ON ai.id = c.interaction_id
      WHERE c.created_at >= ${utcTimestamp(from)} AND c.created_at < ${utcTimestamp(to)}
        AND p.role = 'PHYSICIAN'
        AND ai.params->>'demoCase' IS NULL
      GROUP BY c.kind
    `;
  }

  /**
   * Lacunas por síndrome de PS. A lacuna é do conteúdo, não de quem a
   * registrou (a tabela nem guarda o médico): entram todas. Nota e consultas
   * de busca ficam no banco; o painel só conta.
   */
  private queryGaps({ from, to }: WeekWindow): Promise<GapSyndromeRow[]> {
    return this.prisma.$queryRaw<GapSyndromeRow[]>`
      SELECT syndrome, count(*)::int AS count
      FROM knowledge_gaps
      WHERE created_at >= ${utcTimestamp(from)} AND created_at < ${utcTimestamp(to)}
      GROUP BY syndrome
    `;
  }
}

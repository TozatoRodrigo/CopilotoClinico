import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import {
  ABANDONMENT_ALERT_THRESHOLD,
  type ActivationFunnel,
  type DecisionLoopFunnel,
  type FunnelQueryOptions,
  type ProductFunnel,
} from './product-funnel.types';

/** Structural view over aiInteraction.rawOutput (counts only — never exposed). */
interface OutputShape {
  clarifyingQuestions?: Array<{ id?: string; criticality?: string }>;
  uncertainty?: boolean;
}

interface AnsweredShape {
  questionId?: string;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Computes the product funnels (F5) from existing tables.
 *
 * Decision loop: análise iniciada → perguntas emitidas → % respondidas →
 * reanálise → conduta definitiva → confirmação. Activation: cadastro →
 * 1º atendimento → 1ª análise → 1ª confirmação.
 *
 * LGPD-safe: operates on structural fields only (question ids, criticality
 * flags, counts, opaque ids, durations). No caseText / answers / recommendation
 * text is read for metrics or returned. See product-funnel.service.spec.ts.
 */
@Injectable()
export class ProductFunnelService {
  private readonly logger = new Logger(ProductFunnelService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getFunnel(options: FunnelQueryOptions = {}): Promise<ProductFunnel> {
    const days = Math.min(Math.max(options.days ?? 7, 1), 365);
    const demoCase = options.demoCase?.trim() || null;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [decisionLoop, activation] = await Promise.all([
      this.getDecisionLoopFunnel(since, demoCase),
      this.getActivationFunnel(since),
    ]);

    return {
      period: `last${days}days`,
      demoCase,
      decisionLoop,
      activation,
      generatedAt: new Date().toISOString(),
    };
  }

  /** The #1 product metric — answers "% blocker respondidas" and "turnos até conduta". */
  async getDecisionLoopFunnel(since: Date, demoCase: string | null): Promise<DecisionLoopFunnel> {
    const roots = await this.prisma.aiInteraction.findMany({
      where: {
        parentInteractionId: null,
        createdAt: { gte: since },
        ...(demoCase ? { params: { path: ['demoCase'], equals: demoCase } } : {}),
      },
      select: { encounterId: true },
    });

    const encounterIds = [...new Set(roots.map((r) => r.encounterId))];
    const analysesStarted = encounterIds.length;

    if (analysesStarted === 0) {
      return this.emptyDecisionLoop();
    }

    const interactions = await this.prisma.aiInteraction.findMany({
      where: { encounterId: { in: encounterIds } },
      select: {
        encounterId: true,
        turnIndex: true,
        uncertainty: true,
        rawOutput: true,
        answeredQuestions: true,
      },
    });

    const byEncounter = this.groupBy(interactions, (i) => i.encounterId);

    const confirmedDocs = await this.prisma.document.findMany({
      where: { encounterId: { in: encounterIds }, confirmedAt: { not: null } },
      select: { encounterId: true },
    });
    const confirmedEncounters = new Set(confirmedDocs.map((d) => d.encounterId));

    let encountersWithBlockers = 0;
    let blockerEmittedTotal = 0;
    let blockerAnsweredTotal = 0;
    let reachedConduta = 0;
    let turnsSum = 0;
    let turnsCount = 0;
    let abandoned = 0;
    let uncertainInteractions = 0;
    let totalInteractions = interactions.length;

    for (const encounterId of encounterIds) {
      const rows = byEncounter.get(encounterId) ?? [];

      const emittedById = new Map<string, string>(); // questionId -> criticality
      const answeredIds = new Set<string>();
      let maxTurn = 0;
      let closedLoop = false;

      for (const row of rows) {
        const output = (row.rawOutput as OutputShape | null) ?? {};
        const questions = output.clarifyingQuestions ?? [];
        if (Array.isArray(questions)) {
          if (questions.length === 0) closedLoop = true;
          for (const q of questions) {
            if (q?.id) emittedById.set(q.id, (q.criticality ?? '').toLowerCase());
          }
        }
        if (row.turnIndex > maxTurn) maxTurn = row.turnIndex;
        if (row.uncertainty) uncertainInteractions++;
        const answered = (row.answeredQuestions as AnsweredShape[] | null) ?? [];
        if (Array.isArray(answered)) {
          for (const a of answered) if (a?.questionId) answeredIds.add(a.questionId);
        }
      }

      const blockerIds = [...emittedById.entries()]
        .filter(([, c]) => c === 'blocker')
        .map(([id]) => id);

      if (blockerIds.length > 0) encountersWithBlockers++;
      blockerEmittedTotal += blockerIds.length;
      const blockerAnswered = blockerIds.filter((id) => answeredIds.has(id)).length;
      blockerAnsweredTotal += blockerAnswered;

      const confirmed = confirmedEncounters.has(encounterId);
      if (closedLoop) {
        reachedConduta++;
        turnsSum += maxTurn + 1;
        turnsCount++;
      }
      if (blockerIds.length > 0 && !closedLoop && !confirmed) abandoned++;
    }

    const blockerAnswerRate =
      blockerEmittedTotal > 0 ? blockerAnsweredTotal / blockerEmittedTotal : 0;
    const avgTurnsToConduta = turnsCount > 0 ? round3(turnsSum / turnsCount) : null;
    const abandonmentRate = encountersWithBlockers > 0 ? abandoned / encountersWithBlockers : 0;

    this.logger.debug(
      `Decision loop funnel: analysesStarted=${analysesStarted} ` +
        `blockerAnswerRate=${round3(blockerAnswerRate)} ` +
        `abandonmentRate=${round3(abandonmentRate)} ` +
        `(threshold=${ABANDONMENT_ALERT_THRESHOLD})`,
    );

    return {
      analysesStarted,
      encountersWithBlockers,
      blockerQuestionsEmitted: blockerEmittedTotal,
      blockerQuestionsAnswered: blockerAnsweredTotal,
      blockerAnswerRate: round3(blockerAnswerRate),
      reachedConduta,
      avgTurnsToConduta,
      abandoned,
      abandonmentRate: round3(abandonmentRate),
      confirmedDocuments: confirmedEncounters.size,
      uncertaintyRate: round3(
        totalInteractions > 0 ? uncertainInteractions / totalInteractions : 0,
      ),
    };
  }

  /** Activation: register → first encounter → first analysis → first confirmation. */
  async getActivationFunnel(since: Date): Promise<ActivationFunnel> {
    const [registered, encounterRows, analysisRows, confirmedRows] = await Promise.all([
      this.prisma.physician.count({ where: { createdAt: { gte: since } } }),
      this.prisma.encounter.findMany({
        where: { createdAt: { gte: since } },
        distinct: ['physicianId'],
        select: { physicianId: true },
      }),
      this.prisma.aiInteraction.findMany({
        where: { parentInteractionId: null, createdAt: { gte: since } },
        select: { encounter: { select: { physicianId: true } } },
      }),
      this.prisma.document.findMany({
        where: { confirmedAt: { not: null, gte: since } },
        distinct: ['confirmedBy'],
        select: { confirmedBy: true },
      }),
    ]);

    return {
      registered,
      withEncounter: encounterRows.length,
      withAnalysis: new Set(analysisRows.map((r) => r.encounter.physicianId)).size,
      withConfirmation: confirmedRows.length,
    };
  }

  private emptyDecisionLoop(): DecisionLoopFunnel {
    return {
      analysesStarted: 0,
      encountersWithBlockers: 0,
      blockerQuestionsEmitted: 0,
      blockerQuestionsAnswered: 0,
      blockerAnswerRate: 0,
      reachedConduta: 0,
      avgTurnsToConduta: null,
      abandoned: 0,
      abandonmentRate: 0,
      confirmedDocuments: 0,
      uncertaintyRate: 0,
    };
  }

  private groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const k = key(item);
      const list = map.get(k);
      if (list) list.push(item);
      else map.set(k, [item]);
    }
    return map;
  }
}

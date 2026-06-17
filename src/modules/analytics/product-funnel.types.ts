/**
 * Product funnel shapes (F5).
 *
 * LGPD-safe by construction: every field is a count, ratio, duration or opaque
 * identifier. No clinical content (caseText, answers, recommendations) ever
 * leaves the service — see product-funnel.service.spec.ts for the guard test.
 */

export interface FunnelQueryOptions {
  /** Rolling window in days (default 7). */
  days?: number;
  /** Segment by the caso-norte / demo tag stored on aiInteraction.params.demoCase. */
  demoCase?: string;
}

export interface DecisionLoopFunnel {
  analysesStarted: number;
  encountersWithBlockers: number;
  blockerQuestionsEmitted: number;
  blockerQuestionsAnswered: number;
  /** Share of emitted blocker questions that received an answer (0–1). */
  blockerAnswerRate: number;
  /** Encounters that closed the loop (a turn with no new clarifying questions). */
  reachedConduta: number;
  /** Average turns until the loop closed (among those that closed). */
  avgTurnsToConduta: number | null;
  /** Encounters that emitted a blocker but neither closed the loop nor confirmed a document. */
  abandoned: number;
  /** abandoned / encountersWithBlockers (0–1). */
  abandonmentRate: number;
  confirmedDocuments: number;
  uncertaintyRate: number;
}

export interface ActivationFunnel {
  registered: number;
  withEncounter: number;
  withAnalysis: number;
  withConfirmation: number;
}

export interface ProductFunnel {
  period: string;
  demoCase: string | null;
  decisionLoop: DecisionLoopFunnel;
  activation: ActivationFunnel;
  generatedAt: string;
}

/** Abandonment threshold for the alerting cron (criterion #2). */
export const ABANDONMENT_ALERT_THRESHOLD = 0.3;

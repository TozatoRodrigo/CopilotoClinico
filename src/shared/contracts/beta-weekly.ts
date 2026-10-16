/**
 * CC-705 — painel semanal do beta: os números da reunião de sexta (CC-706)
 * num lugar só, com a semana anterior ao lado. Compartilhado entre a API
 * (`GET /admin/beta/weekly`) e o console admin.
 *
 * Só contagens, taxas, custo e latência. Nenhum texto clínico, nenhum
 * identificador de paciente, e médico só aparece agregado: nenhum id, nome
 * ou ranking sai da API.
 */
import type { AiCallAnalysisSummary } from './ai-calls';
import type { BetaActivationCounts } from './beta';
import type { CopilotFeedbackKind } from './clinical';

/** A semana vai de segunda 00:00 a domingo 23:59 no horário de Brasília. */
export const BETA_WEEK_TIME_ZONE = 'America/Sao_Paulo';

/** Lacunas listadas no painel; o resto entra só no total. */
export const BETA_WEEKLY_TOP_GAPS = 5;

/** Faixas de análises por médico ativo: mostra a forma da distribuição, nunca quem. */
export const BETA_ANALYSES_BUCKETS = ['0', '1', '2-4', '5-9', '10+'] as const;
export type BetaAnalysesBucket = (typeof BETA_ANALYSES_BUCKETS)[number];

/** Uma semana e o trecho dela que foi medido. */
export interface BetaWeekRange {
  /** Segunda-feira, data local de Brasília (`2026-10-12`). */
  weekStart: string;
  /** Domingo da mesma semana (`2026-10-18`). */
  weekEnd: string;
  /** Início da janela medida (ISO, UTC): segunda 00:00 em Brasília. */
  from: string;
  /** Fim exclusivo da janela medida (ISO, UTC). */
  to: string;
}

export interface BetaWeeklyPeriod {
  current: BetaWeekRange;
  previous: BetaWeekRange;
  /**
   * A semana pedida é a corrente e ainda não acabou: ela é medida até agora e
   * a anterior é cortada no mesmo ponto (mesmo dia da semana e hora), para a
   * comparação não pôr uma semana pela metade contra uma inteira.
   */
  inProgress: boolean;
}

/** O mesmo número na semana pedida e na anterior. */
export interface BetaWeeklyComparison<T> {
  current: T;
  previous: T;
}

/** Número que o banco ainda não tem: o painel mostra "sem dado" e de onde virá. */
export interface BetaWeeklyUnavailable {
  available: false;
  /** Por que não há número hoje. */
  reason: string;
  /** História do backlog que traz o dado (ex.: `CC-408`). */
  source: string;
}

/**
 * Ponto de extensão: quando a história de origem entregar o dado, o serviço
 * passa a devolver `available: true` e a tela e a ata já sabem mostrar.
 */
export type BetaWeeklyOptional<T> =
  | ({ available: true } & BetaWeeklyComparison<T>)
  | BetaWeeklyUnavailable;

export interface BetaWeeklyUsage {
  /**
   * Médicos (papel PHYSICIAN) com análise concluída ou pergunta do Copiloto
   * respondida em caso real na semana. Ferramenta usada ainda não entra: o
   * uso de ferramentas não fica no banco (ver `toolUsage`).
   */
  activePhysicians: number;
  /** Dos ativos, os que tiveram ao menos uma análise concluída. */
  physiciansWithAnalysis: number;
  /** Análises concluídas de casos reais: sem falha de validação e sem caso de exemplo. */
  analyses: number;
  /** Análises do caso de exemplo do onboarding, fora das contas acima. */
  demoAnalyses: number;
  /** Análises por médico ativo; `null` sem médico ativo. */
  analysesPerPhysician: { mean: number | null; median: number | null };
  /** Quantos médicos ativos caem em cada faixa de análises, sempre na ordem de `BETA_ANALYSES_BUCKETS`. */
  distribution: { bucket: BetaAnalysesBucket; physicians: number }[];
}

export interface BetaWeeklyFeedback {
  /** Reportes negativos (cenário errado, faltou cobertura, conduta incorreta) em casos reais. */
  negative: number;
  helpful: number;
  byKind: Record<CopilotFeedbackKind, number>;
  /** Negativos por 100 análises concluídas da mesma semana; `null` sem análise. */
  negativePer100Analyses: number | null;
}

/** Análises com cartão aplicado (CC-408). */
export interface BetaWeeklyCardUsage {
  analyses: number;
  withCard: number;
  /** 0 a 1; `null` sem análise. */
  rate: number | null;
}

export interface BetaWeeklyToolUsage {
  uses: number;
  physicians: number;
}

export interface BetaWeeklyMentorship {
  requests: number;
}

/** Lacunas ("não encontrei o que precisava") de uma síndrome de PS. */
export interface BetaWeeklyGapRow {
  /** Uma das `PS_SYNDROMES`; `null` quando a análise não registrou o entendimento. */
  syndrome: string | null;
  current: number;
  previous: number;
}

export interface BetaWeeklyGaps {
  total: BetaWeeklyComparison<number>;
  /** As mais frequentes da semana pedida, até `BETA_WEEKLY_TOP_GAPS`. */
  top: BetaWeeklyGapRow[];
}

/** Ativação em 24 h dos médicos que se cadastraram na semana (definição da CC-702). */
export interface BetaWeeklyActivationWeek {
  overall: BetaActivationCounts;
  byBatch: (BetaActivationCounts & { batchLabel: string | null })[];
}

export interface BetaWeeklyActivation extends BetaWeeklyComparison<BetaWeeklyActivationWeek> {
  target: number;
}

/** `GET /admin/beta/weekly?week=YYYY-MM-DD` */
export interface BetaWeeklyReport {
  period: BetaWeeklyPeriod;
  usage: BetaWeeklyComparison<BetaWeeklyUsage>;
  feedback: BetaWeeklyComparison<BetaWeeklyFeedback>;
  /** Custo e latência por análise, de `ai_calls` (CC-004). */
  aiCost: BetaWeeklyComparison<AiCallAnalysisSummary>;
  cardUsage: BetaWeeklyOptional<BetaWeeklyCardUsage>;
  toolUsage: BetaWeeklyOptional<BetaWeeklyToolUsage>;
  mentorship: BetaWeeklyOptional<BetaWeeklyMentorship>;
  knowledgeGaps: BetaWeeklyGaps;
  activation: BetaWeeklyActivation;
  /** Resumo da semana em markdown, pronto para colar na ata do ClickUp (CC-706). */
  markdown: string;
  generatedAt: string;
}

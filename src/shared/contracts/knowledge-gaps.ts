import type { PsSyndrome } from './clinical';
import type { KnowledgeCardDraftResult } from './knowledge-cards';

/**
 * CC-409 — registro de lacunas e fila de criação de cartões.
 *
 * Uma lacuna é uma vez em que o médico procurou e o Copiloto não tinha
 * cartão: a síndrome e as consultas mascaradas, nunca o texto do caso, e
 * nunca o médico. Lacunas parecidas formam um grupo — o item da fila que o
 * curador transforma em rascunho de cartão (CC-403) ou descarta.
 *
 * Só tipos e listas de valores: o web importa este arquivo pelo alias
 * `@contracts/*` e não tem o zod.
 */

/** As três fontes, na mesma tabela (`knowledge_gaps`). Igual ao enum do Prisma. */
export const KNOWLEDGE_GAP_SOURCES = [
  /** "Não encontrei o que precisava", tocado pelo médico na análise (CC-703). */
  'physician_not_found',
  /** A decisão buscou cartão e o portão não aceitou nenhum (CC-408). */
  'decision_no_card',
  /** A pergunta rápida não achou cartão (CC-501). */
  'quick_question',
] as const;
export type KnowledgeGapSource = (typeof KNOWLEDGE_GAP_SOURCES)[number];

/** Onde o grupo está na fila. Igual ao enum `KnowledgeGapGroupStatus` do Prisma. */
export const KNOWLEDGE_GAP_STATUSES = ['open', 'drafting', 'covered', 'dismissed'] as const;
export type KnowledgeGapStatus = (typeof KNOWLEDGE_GAP_STATUSES)[number];

/**
 * Gravidade da síndrome do grupo, para ordenar a fila: tempo-crítica (trata
 * em minutos a uma hora), urgente e comum. Provisória até a revisão médica
 * (ver `SYNDROME_SEVERITY`).
 */
export const KNOWLEDGE_GAP_SEVERITIES = ['time_critical', 'urgent', 'common'] as const;
export type KnowledgeGapSeverity = (typeof KNOWLEDGE_GAP_SEVERITIES)[number];

/** Cartão publicado que cobriu o grupo. */
export interface KnowledgeGapCoveringCard {
  id: string;
  topic: string;
}

/** Um grupo de lacunas parecidas, como a fila mostra. */
export interface KnowledgeGapQueueItem {
  id: string;
  /** Tema sugerido para o rascunho (primeira consulta da lacuna que abriu o grupo). */
  topic: string;
  syndrome: PsSyndrome | null;
  severity: KnowledgeGapSeverity;
  /** Ocorrências × peso da gravidade: a ordem da fila. */
  priority: number;
  status: KnowledgeGapStatus;
  occurrences: number;
  occurrencesLast7Days: number;
  /** Ocorrências por fonte; fonte sem ocorrência fica de fora. */
  sources: Partial<Record<KnowledgeGapSource, number>>;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Consultas mascaradas das lacunas, as mais repetidas primeiro (até 5). */
  queries: string[];
  /** Frases do "não encontrei o que precisava", mascaradas, as mais recentes (até 3). */
  notes: string[];
  draftId: string | null;
  coveredByCard: KnowledgeGapCoveringCard | null;
  dismissReason: string | null;
  statusChangedAt: string | null;
  /** Fechado (coberto ou descartado) e apareceu de novo depois disso. */
  recurredAfterClose: boolean;
}

/** GET /admin/knowledge-gaps */
export interface KnowledgeGapQueuePage {
  items: KnowledgeGapQueueItem[];
  total: number;
  countsByStatus: Record<KnowledgeGapStatus, number>;
  /** `KNOWLEDGE_CARDS_DRAFT_ENABLED`: sem ela, "gerar rascunho" responde 503. */
  draftEnabled: boolean;
}

export interface KnowledgeGapQueueQuery {
  status?: KnowledgeGapStatus;
  limit?: number;
  offset?: number;
}

/** POST /admin/knowledge-gaps/:id/draft — o tema pode ser ajustado antes de ir à IA. */
export interface DraftFromKnowledgeGapRequest {
  /** Sem ele, vai o tema do grupo. */
  topic?: string;
  /** `false` deixa os cartões em rascunho, fora da fila de revisão. Padrão `true`. */
  submitForReview?: boolean;
}

export interface DraftFromKnowledgeGapResponse {
  item: KnowledgeGapQueueItem;
  draft: KnowledgeCardDraftResult;
}

/** POST /admin/knowledge-gaps/:id/dismiss */
export interface DismissKnowledgeGapRequest {
  reason: string;
}

export const KNOWLEDGE_GAP_DISMISS_REASON_MAX_CHARS = 500;

/** Um grupo no relatório semanal. */
export interface KnowledgeGapWeeklyItem {
  id: string;
  topic: string;
  syndrome: PsSyndrome | null;
  severity: KnowledgeGapSeverity;
  status: KnowledgeGapStatus;
  occurrencesInWeek: number;
  occurrences: number;
  sourcesInWeek: Partial<Record<KnowledgeGapSource, number>>;
  lastSeenAt: string;
}

/**
 * GET /admin/knowledge-gaps/weekly-report — as lacunas mais frequentes dos
 * últimos 7 dias, para o painel do beta (CC-705) e o ritual de sexta.
 */
export interface KnowledgeGapWeeklyReport {
  from: string;
  to: string;
  occurrences: number;
  bySource: Record<KnowledgeGapSource, number>;
  /** Grupos abertos pela primeira vez na semana. */
  newGroups: number;
  /** Grupos fechados na semana. */
  closed: { covered: number; dismissed: number };
  /** Até 10, sem os descartados: mais ocorrências na semana primeiro. */
  top: KnowledgeGapWeeklyItem[];
}

export const KNOWLEDGE_GAP_WEEKLY_TOP = 10;

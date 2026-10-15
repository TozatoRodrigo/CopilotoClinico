import type {
  ApproveKnowledgeCardRequest,
  KnowledgeCardContentInput,
  KnowledgeCardDetail,
  KnowledgeCardPhysicianRef,
  KnowledgeCardStatus,
  RejectKnowledgeCardRequest,
} from './knowledge-cards';

/**
 * CC-404 (ADR-019, adendo) — fila de revisão de cartões no celular: um
 * cartão por vez, com o texto integral das fontes e o trecho citado
 * destacado. Acesso pelo papel de revisor (`is_card_reviewer` + CRM
 * verificado), não pelo console admin.
 *
 * Só tipos: o web importa este arquivo pelo alias `@contracts/*`.
 */

/** Faixa de texto em offsets UTF-16 (`String.prototype.slice`), fim exclusivo. */
export interface KnowledgeCardTextRange {
  start: number;
  end: number;
}

/** Texto integral de uma fonte do cartão, para o revisor ler a citação no contexto. */
export interface KnowledgeCardSourceText {
  /** Chave da fonte no cartão ("S1"). */
  key: string;
  chunkId: string;
  /** `null` quando o trecho de diretriz não existe mais. */
  text: string | null;
  /** O texto ainda é o que a checagem de citação conferiu (`chunkSha256` da fonte). */
  matchesCitedText: boolean;
  /** Onde estão, no texto, os trechos citados pela versão em revisão. Sem sobreposição, em ordem. */
  highlights: KnowledgeCardTextRange[];
}

/**
 * CC-411 — a correção na fila veio de uma revisão cruzada que divergiu: o
 * segundo médico discordou da versão aprovada, e o cartão saiu do ar.
 */
export interface KnowledgeCardDivergence {
  crossReviewId: string;
  /** Versão aprovada de que o segundo médico divergiu. */
  disputedVersion: number;
  firstReviewer: KnowledgeCardPhysicianRef;
  crossReviewer: KnowledgeCardPhysicianRef;
  /** Motivo da divergência, já mascarado de dados pessoais. */
  reason: string;
  reviewedAt: string;
}

/** CC-411 — a revisão cruzada que o segundo médico vai fazer. */
export interface KnowledgeCardCrossReviewTask {
  id: string;
  /** Quem aprovou a versão sorteada, quando e até quando ela vale. */
  firstReviewer: KnowledgeCardPhysicianRef;
  approvedAt: string;
  validUntil: string;
}

interface KnowledgeCardReviewItemBase {
  card: KnowledgeCardDetail;
  sourceTexts: KnowledgeCardSourceText[];
}

/** Cartão em revisão: decidir a versão mais recente. */
export interface KnowledgeCardReviewTaskItem extends KnowledgeCardReviewItemBase {
  kind: 'review';
  /** Versão em decisão: a mais recente (`card.versions[0]`). */
  version: number;
  divergence: KnowledgeCardDivergence | null;
}

/** CC-411 — aprovação sorteada: concordar ou divergir da versão publicada. */
export interface KnowledgeCardCrossReviewItem extends KnowledgeCardReviewItemBase {
  kind: 'cross_review';
  /** Versão publicada sorteada; as fontes e os destaques são dela. */
  version: number;
  crossReview: KnowledgeCardCrossReviewTask;
}

export type KnowledgeCardReviewItem = KnowledgeCardReviewTaskItem | KnowledgeCardCrossReviewItem;

/** GET /review/knowledge-cards/next */
export interface KnowledgeCardReviewQueue {
  /**
   * Próximo item — revisão cruzada primeiro (é cartão no ar) —, ou `null` com
   * a fila vazia (ou toda pulada).
   */
  item: KnowledgeCardReviewItem | null;
  /** No escopo do revisor, contando o mostrado e os pulados. */
  pending: {
    /** Cartões em revisão. */
    review: number;
    /** Revisões cruzadas que este médico pode fazer (não aprovou nem escreveu a versão). */
    crossReview: number;
  };
}

/**
 * Query de GET /review/knowledge-cards/next. `skip`: ids separados por
 * vírgula dos cartões que o revisor pulou nesta sessão — ficam de fora.
 */
export interface KnowledgeCardReviewQueueQuery {
  skip?: string;
}

/** Na fila de revisão o tempo é sempre medido: a tela cronometra cada cartão. */
export interface ReviewApproveKnowledgeCardRequest extends ApproveKnowledgeCardRequest {
  reviewDurationMs: number;
}

export interface ReviewRejectKnowledgeCardRequest extends RejectKnowledgeCardRequest {
  reviewDurationMs: number;
}

export const KNOWLEDGE_CARD_CROSS_REVIEW_STATUSES = ['pending', 'agreed', 'diverged'] as const;
export type KnowledgeCardCrossReviewStatus = (typeof KNOWLEDGE_CARD_CROSS_REVIEW_STATUSES)[number];

/** POST /review/knowledge-cards/cross-reviews/:id/agree */
export interface AgreeCrossReviewRequest {
  reviewDurationMs: number;
  comment?: string;
}

/**
 * POST /review/knowledge-cards/cross-reviews/:id/diverge — divergir é
 * corrigir: o motivo e o conteúdo inteiro da versão nova (a mesma checagem
 * de citação; 422 com os problemas). `basedOnVersion` é a versão publicada
 * que o segundo médico viu. O cartão sai do ar e volta para a fila.
 */
export interface DivergeCrossReviewRequest {
  reason: string;
  reviewDurationMs: number;
  basedOnVersion: number;
  content: KnowledgeCardContentInput;
}

/** Uma divergência recente, para o painel. */
export interface KnowledgeCardDivergenceSummary {
  crossReviewId: string;
  cardId: string;
  topic: string;
  /** Pergunta da versão de que o segundo médico divergiu. */
  question: string;
  cardStatus: KnowledgeCardStatus;
  disputedVersion: number;
  correctionVersion: number | null;
  firstReviewer: KnowledgeCardPhysicianRef;
  crossReviewer: KnowledgeCardPhysicianRef;
  reason: string;
  reviewedAt: string;
}

/** GET /review/knowledge-cards/cross-reviews/summary — painel da taxa de concordância (CC-411). */
export interface KnowledgeCardCrossReviewSummary {
  /** Porcentagem das aprovações sorteada para revisão cruzada (10). */
  samplePercent: number;
  /** Aprovações no escopo: o universo do sorteio. */
  approvals: number;
  /** Aprovações que caíram no sorteio. */
  sampled: number;
  /** Sorteadas à espera do segundo médico, com a versão ainda no ar. */
  pending: number;
  /** Sorteadas cuja versão saiu do ar antes da revisão cruzada (outra aprovação ou arquivamento). */
  superseded: number;
  agreed: number;
  diverged: number;
  /** `agreed / (agreed + diverged)`; `null` sem revisão cruzada feita. */
  agreementRate: number | null;
  divergenceRate: number | null;
  /** Meta do CC-411: divergência abaixo disto (0,05). */
  divergenceTarget: number;
  /** Tempo das últimas decisões de revisão (aprovar/descartar), para a meta de 6 minutos (CC-404). */
  reviewTime: { decisions: number; medianMs: number | null };
  /** As 10 divergências mais recentes. */
  recentDivergences: KnowledgeCardDivergenceSummary[];
}

import type {
  ApproveKnowledgeCardRequest,
  KnowledgeCardDetail,
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

export interface KnowledgeCardReviewItem {
  kind: 'review';
  card: KnowledgeCardDetail;
  /** Versão em decisão: a mais recente (`card.versions[0]`). */
  version: number;
  sourceTexts: KnowledgeCardSourceText[];
}

/** GET /review/knowledge-cards/next */
export interface KnowledgeCardReviewQueue {
  /** Próximo cartão, ou `null` com a fila vazia (ou toda pulada). */
  item: KnowledgeCardReviewItem | null;
  /** Cartões em revisão no escopo do revisor, contando o mostrado e os pulados. */
  pending: number;
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

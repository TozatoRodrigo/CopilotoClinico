import type { Prisma } from '@prisma/client';
import { KnowledgeCardContentSchema } from '../domain/card-content';
import { cardEmbeddingText, embeddingTextSha256 } from './card-embedding-text';

/**
 * CC-406 — o que a indexação precisa saber de um cartão: a versão publicada,
 * a decisão e a validade dela, e se o revisor ainda tem CRM verificado.
 */
export const INDEX_CARD_SELECT = {
  id: true,
  topic: true,
  syndrome: true,
  institutionId: true,
  status: true,
  publishedVersion: {
    select: {
      id: true,
      content: true,
      contentSha256: true,
      reviewDecision: true,
      validUntil: true,
      reviewer: { select: { crmVerified: true } },
    },
  },
} as const satisfies Prisma.KnowledgeCardSelect;

export type IndexCardRow = Prisma.KnowledgeCardGetPayload<{ select: typeof INDEX_CARD_SELECT }>;

/** A linha do índice antes do vetor. */
export interface CardIndexEntryDraft {
  cardId: string;
  versionId: string;
  institutionId: string | null;
  syndrome: string | null;
  validUntil: Date;
  contentSha256: string;
  /** O que vira vetor (`cardEmbeddingText`). Nunca vai para log. */
  text: string;
  textSha256: string;
}

/** Por que um cartão não pode estar no índice. Vai para o log (`CARD_INDEX_REMOVED`). */
export const CARD_INDEX_REMOVAL_REASONS = [
  'not_found',
  'archived',
  'not_published',
  'expired',
  'reviewer_unverified',
  'invalid_content',
] as const;
export type CardIndexRemovalReason = (typeof CARD_INDEX_REMOVAL_REASONS)[number];

export type CardIndexDecision =
  | { action: 'index'; entry: CardIndexEntryDraft }
  | { action: 'remove'; reason: CardIndexRemovalReason };

/**
 * CC-406 — só versão publicada e válida entra no índice: a que um médico com
 * CRM verificado aprovou e cuja validade não venceu. Corrigir um cartão
 * publicado (status `in_review`) não o tira do índice — a versão assinada
 * segue valendo até outra ser aprovada (ADR-019). Arquivado sai, mesmo com
 * versão publicada; vencido sai (o médico o vê como "revisar").
 *
 * O revisor perder a verificação de CRM também tira o cartão: "Revisado por"
 * só vale com CRM verificado, como a assinatura de chunk da ADR-012.
 */
export function indexDecision(card: IndexCardRow | null, now: Date): CardIndexDecision {
  if (!card) return { action: 'remove', reason: 'not_found' };
  if (card.status === 'archived') return { action: 'remove', reason: 'archived' };

  const published = card.publishedVersion;
  if (!published || published.reviewDecision !== 'approved' || !published.validUntil) {
    return { action: 'remove', reason: 'not_published' };
  }
  if (published.validUntil.getTime() <= now.getTime()) {
    return { action: 'remove', reason: 'expired' };
  }
  if (!published.reviewer?.crmVerified) return { action: 'remove', reason: 'reviewer_unverified' };

  const content = KnowledgeCardContentSchema.safeParse(published.content);
  if (!content.success) return { action: 'remove', reason: 'invalid_content' };

  const text = cardEmbeddingText(card.topic, content.data);
  return {
    action: 'index',
    entry: {
      cardId: card.id,
      versionId: published.id,
      institutionId: card.institutionId,
      syndrome: card.syndrome,
      validUntil: published.validUntil,
      contentSha256: published.contentSha256,
      text,
      textSha256: embeddingTextSha256(text),
    },
  };
}

/** O que o índice já tem de um cartão — para não reembutir o que não mudou. */
export interface IndexedState {
  versionId: string;
  textSha256: string;
  embeddingModel: string | null;
}

/**
 * O vetor gravado ainda vale quando é da mesma versão, do mesmo texto e do
 * modelo atual. Linha sem vetor (provedor estava fora) sempre reembute.
 */
export function needsEmbedding(
  entry: CardIndexEntryDraft,
  indexed: IndexedState | undefined,
  currentModel: string,
): boolean {
  return (
    !indexed ||
    indexed.embeddingModel !== currentModel ||
    indexed.versionId !== entry.versionId ||
    indexed.textSha256 !== entry.textSha256
  );
}

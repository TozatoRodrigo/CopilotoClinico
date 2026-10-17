import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PS_SYNDROMES, type PsSyndrome } from '../../../shared/contracts/clinical';
import type {
  PublishedKnowledgeCard,
  ReviewedCard,
} from '../../../shared/contracts/knowledge-cards';
import { KnowledgeCardContentSchema } from '../domain/card-content';

/**
 * CC-408 — o cartão publicado com a versão assinada e o revisor: o que a
 * decisão recebe e o que o médico abre pelo "Revisado por".
 */
export const REVIEWED_CARD_SELECT = {
  id: true,
  institutionId: true,
  topic: true,
  syndrome: true,
  status: true,
  publishedVersion: {
    select: {
      id: true,
      version: true,
      content: true,
      contentSha256: true,
      reviewDecision: true,
      reviewedAt: true,
      validUntil: true,
      reviewer: {
        select: { id: true, name: true, crmUf: true, crmNumber: true, crmVerified: true },
      },
    },
  },
} as const satisfies Prisma.KnowledgeCardSelect;

export type ReviewedCardRow = Prisma.KnowledgeCardGetPayload<{
  select: typeof REVIEWED_CARD_SELECT;
}>;

const SyndromeSchema = z.enum(PS_SYNDROMES);

function toSyndrome(value: string | null): PsSyndrome | null {
  const parsed = SyndromeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * A versão publicada como cartão revisado, ou `null` quando ela não vale como
 * fonte revisada: não aprovada, sem validade, revisor sem CRM verificado ou
 * conteúdo que não valida (falha de integridade — fica de fora, não pela
 * metade). A validade de data quem confere é quem chama, com o relógio dele.
 */
export function toReviewedCard(row: ReviewedCardRow): ReviewedCard | null {
  const published = row.publishedVersion;
  if (
    row.status === 'archived' ||
    !published ||
    published.reviewDecision !== 'approved' ||
    !published.reviewedAt ||
    !published.validUntil ||
    !published.reviewer?.crmVerified
  ) {
    return null;
  }
  const content = KnowledgeCardContentSchema.safeParse(published.content);
  if (!content.success) return null;
  return {
    cardId: row.id,
    institutionId: row.institutionId,
    topic: row.topic,
    syndrome: toSyndrome(row.syndrome),
    versionId: published.id,
    version: published.version,
    content: content.data,
    contentSha256: published.contentSha256,
    reviewer: { ...published.reviewer },
    reviewedAt: published.reviewedAt.toISOString(),
    validUntil: published.validUntil.toISOString(),
  };
}

/** O cartão como o médico do plantão o abre: sem ids internos do revisor. */
export function toPublishedCard(card: ReviewedCard, now: Date): PublishedKnowledgeCard {
  return {
    id: card.cardId,
    topic: card.topic,
    syndrome: card.syndrome,
    displayStatus:
      new Date(card.validUntil).getTime() < now.getTime() ? 'needs_review' : 'published',
    version: card.version,
    content: card.content,
    reviewer: {
      name: card.reviewer.name,
      crmNumber: card.reviewer.crmNumber,
      crmUf: card.reviewer.crmUf,
    },
    reviewedAt: card.reviewedAt,
    validUntil: card.validUntil,
  };
}

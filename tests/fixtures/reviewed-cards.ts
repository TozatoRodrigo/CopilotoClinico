import type { Prisma } from '@prisma/client';
import type { ReviewedCardRetrievalService } from '../../src/modules/knowledge-cards/card-retrieval/reviewed-card-retrieval.service';
import type { KnowledgeGapsService } from '../../src/modules/knowledge-gaps/knowledge-gaps.service';
import type { ReviewedCardRow } from '../../src/modules/knowledge-cards/card-retrieval/reviewed-card-view';
import type { ReviewedCard } from '../../src/shared/contracts/knowledge-cards';
import { storedCardContent } from './knowledge-cards';

/**
 * CC-408 — busca de cartões que não pode rodar: com `COPILOT_REVIEWED_CARDS`
 * desligada (o padrão), a decisão nem procura cartão. Chamar quebra o teste.
 */
export function cardRetrievalNeverCalled(): ReviewedCardRetrievalService {
  return {
    findApplicable: () => {
      throw new Error('com COPILOT_REVIEWED_CARDS desligada, nenhum cartão é buscado');
    },
  } as unknown as ReviewedCardRetrievalService;
}

/**
 * CC-409 — registro de lacunas que não pode ser chamado: sem a busca de
 * cartões, a decisão não tem como dizer que falta cartão.
 */
export function knowledgeGapsNeverCalled(): KnowledgeGapsService {
  return {
    record: () => {
      throw new Error('sem busca de cartões, nenhuma lacuna da decisão é gravada');
    },
  } as unknown as KnowledgeGapsService;
}

export const REVIEWED_CARD_ID = '77777777-7777-4777-8777-777777777777';
export const REVIEWED_VERSION_ID = '66666666-6666-4666-8666-666666666666';
export const REVIEWER_ID = '55555555-5555-4555-8555-555555555555';

/** O cartão de meningite (ceftriaxona 2 g, máximo 4 g/dia) publicado e assinado. */
export function reviewedCard(overrides: Partial<ReviewedCard> = {}): ReviewedCard {
  const { content, contentSha256 } = storedCardContent();
  return {
    cardId: REVIEWED_CARD_ID,
    institutionId: null,
    topic: 'Meningite bacteriana',
    syndrome: 'febre',
    versionId: REVIEWED_VERSION_ID,
    version: 2,
    content,
    contentSha256,
    reviewer: {
      id: REVIEWER_ID,
      name: 'Ana Souza',
      crmUf: 'SP',
      crmNumber: '123456',
      crmVerified: true,
    },
    reviewedAt: '2026-10-12T15:00:00.000Z',
    validUntil: '2027-10-12T15:00:00.000Z',
    ...overrides,
  };
}

/** A linha do banco (`REVIEWED_CARD_SELECT`) do mesmo cartão. */
export function reviewedCardRow(overrides: Partial<ReviewedCardRow> = {}): ReviewedCardRow {
  const card = reviewedCard();
  return {
    id: card.cardId,
    institutionId: null,
    topic: card.topic,
    syndrome: 'febre',
    status: 'published',
    publishedVersion: {
      id: card.versionId,
      version: card.version,
      content: card.content as unknown as Prisma.JsonValue,
      contentSha256: card.contentSha256,
      reviewDecision: 'approved',
      reviewedAt: new Date(card.reviewedAt),
      validUntil: new Date(card.validUntil),
      reviewer: { ...card.reviewer },
    },
    ...overrides,
  };
}

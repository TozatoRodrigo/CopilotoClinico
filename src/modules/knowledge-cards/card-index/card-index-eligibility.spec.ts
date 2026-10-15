import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { storedCardContent } from '../../../../tests/fixtures/knowledge-cards';
import { cardEmbeddingText, embeddingTextSha256 } from './card-embedding-text';
import { indexDecision, needsEmbedding, type IndexCardRow } from './card-index-eligibility';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const CARD_ID = '88888888-8888-4888-8888-888888888888';
const VERSION_ID = '99999999-9999-4999-8999-999999999999';
const { content, contentSha256 } = storedCardContent();

function cardRow(overrides: Partial<IndexCardRow> = {}): IndexCardRow {
  return {
    id: CARD_ID,
    topic: 'Meningite bacteriana',
    syndrome: 'febre',
    institutionId: null,
    status: 'published',
    publishedVersion: {
      id: VERSION_ID,
      content: content as unknown as Prisma.JsonValue,
      contentSha256,
      reviewDecision: 'approved',
      validUntil: new Date('2027-10-15T12:00:00.000Z'),
      reviewer: { crmVerified: true },
    },
    ...overrides,
  };
}

function publishedVersion(
  overrides: Partial<NonNullable<IndexCardRow['publishedVersion']>>,
): IndexCardRow['publishedVersion'] {
  return { ...cardRow().publishedVersion!, ...overrides };
}

describe('indexDecision (CC-406)', () => {
  it('indexa a versão publicada, aprovada, válida e assinada com CRM verificado', () => {
    const decision = indexDecision(cardRow(), NOW);
    const text = cardEmbeddingText('Meningite bacteriana', content);

    expect(decision).toEqual({
      action: 'index',
      entry: {
        cardId: CARD_ID,
        versionId: VERSION_ID,
        institutionId: null,
        syndrome: 'febre',
        validUntil: new Date('2027-10-15T12:00:00.000Z'),
        contentSha256,
        text,
        textSha256: embeddingTextSha256(text),
      },
    });
  });

  it('mantém no índice o cartão publicado com uma correção em revisão', () => {
    expect(indexDecision(cardRow({ status: 'in_review' }), NOW).action).toBe('index');
  });

  it.each([
    ['not_found', null],
    ['archived', cardRow({ status: 'archived' })],
    ['not_published', cardRow({ status: 'in_review', publishedVersion: null })],
    ['not_published', cardRow({ publishedVersion: publishedVersion({ reviewDecision: null }) })],
    ['not_published', cardRow({ publishedVersion: publishedVersion({ validUntil: null }) })],
    ['expired', cardRow({ publishedVersion: publishedVersion({ validUntil: NOW }) })],
    [
      'reviewer_unverified',
      cardRow({ publishedVersion: publishedVersion({ reviewer: { crmVerified: false } }) }),
    ],
    ['reviewer_unverified', cardRow({ publishedVersion: publishedVersion({ reviewer: null }) })],
    ['invalid_content', cardRow({ publishedVersion: publishedVersion({ content: { a: 1 } }) })],
  ])('tira do índice: %s', (reason, row) => {
    expect(indexDecision(row, NOW)).toEqual({ action: 'remove', reason });
  });
});

describe('needsEmbedding (CC-406)', () => {
  const decision = indexDecision(cardRow(), NOW);
  if (decision.action !== 'index') throw new Error('fixture não indexável');
  const { entry } = decision;
  const indexed = {
    versionId: VERSION_ID,
    textSha256: entry.textSha256,
    embeddingModel: 'text-embedding-3-small',
  };

  it('reaproveita o vetor da mesma versão, do mesmo texto e do modelo atual', () => {
    expect(needsEmbedding(entry, indexed, 'text-embedding-3-small')).toBe(false);
  });

  it('reembute cartão novo, linha sem vetor, versão nova, texto novo ou modelo trocado', () => {
    expect(needsEmbedding(entry, undefined, 'text-embedding-3-small')).toBe(true);
    expect(
      needsEmbedding(entry, { ...indexed, embeddingModel: null }, 'text-embedding-3-small'),
    ).toBe(true);
    expect(
      needsEmbedding(entry, { ...indexed, versionId: 'outra' }, 'text-embedding-3-small'),
    ).toBe(true);
    expect(
      needsEmbedding(entry, { ...indexed, textSha256: 'outro' }, 'text-embedding-3-small'),
    ).toBe(true);
    expect(needsEmbedding(entry, indexed, 'voyage-3.5')).toBe(true);
  });
});

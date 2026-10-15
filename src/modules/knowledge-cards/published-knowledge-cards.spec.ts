import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { REVIEWED_CARD_ID, reviewedCardRow } from '../../../tests/fixtures/reviewed-cards';
import type { CardIndexService } from './card-index/card-index.service';
import { REVIEWED_CARD_SELECT } from './card-retrieval/reviewed-card-view';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { PublishedKnowledgeCardsController } from './published-knowledge-cards.controller';

const PHYSICIAN_ID = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';
const INSTITUTION_ID = 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii';

describe('cartão publicado para o médico do plantão (CC-408)', () => {
  let findUnique: ReturnType<typeof vi.fn>;
  let membership: ReturnType<typeof vi.fn>;
  let service: KnowledgeCardsService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    findUnique = vi.fn().mockResolvedValue(reviewedCardRow());
    membership = vi.fn().mockResolvedValue(null);
    service = new KnowledgeCardsService(
      {
        knowledgeCard: { findUnique },
        physicianInstitution: { findUnique: membership },
      } as unknown as PrismaService,
      {} as AuditService,
      {} as CardIndexService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devolve a versão assinada com o nome e o CRM de quem revisou', async () => {
    const card = await service.getPublished(PHYSICIAN_ID, REVIEWED_CARD_ID);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: REVIEWED_CARD_ID },
      select: REVIEWED_CARD_SELECT,
    });
    expect(card).toMatchObject({
      id: REVIEWED_CARD_ID,
      displayStatus: 'published',
      version: 2,
      reviewer: { name: 'Ana Souza', crmNumber: '123456', crmUf: 'SP' },
      validUntil: '2027-10-12T15:00:00.000Z',
    });
    expect(membership).not.toHaveBeenCalled();
  });

  it('mostra "revisar" quando a aprovação venceu', async () => {
    vi.setSystemTime(new Date('2028-01-01T00:00:00.000Z'));

    await expect(service.getPublished(PHYSICIAN_ID, REVIEWED_CARD_ID)).resolves.toMatchObject({
      displayStatus: 'needs_review',
    });
  });

  it.each([
    ['inexistente', null],
    ['arquivado', reviewedCardRow({ status: 'archived' })],
    ['sem versão publicada', reviewedCardRow({ publishedVersion: null })],
  ])('responde 404 para cartão %s', async (_case, row) => {
    findUnique.mockResolvedValue(row);

    await expect(service.getPublished(PHYSICIAN_ID, REVIEWED_CARD_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cartão de instituição só para quem é dela (ADR-009) — e sem dizer que existe', async () => {
    findUnique.mockResolvedValue(reviewedCardRow({ institutionId: INSTITUTION_ID }));

    await expect(service.getPublished(PHYSICIAN_ID, REVIEWED_CARD_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(membership).toHaveBeenCalledWith({
      where: {
        physicianId_institutionId: { physicianId: PHYSICIAN_ID, institutionId: INSTITUTION_ID },
      },
      select: { id: true },
    });

    membership.mockResolvedValue({ id: 'm-1' });
    await expect(service.getPublished(PHYSICIAN_ID, REVIEWED_CARD_ID)).resolves.toMatchObject({
      id: REVIEWED_CARD_ID,
    });
  });

  it('o controller passa o médico autenticado', async () => {
    const getPublished = vi.fn().mockResolvedValue({ id: REVIEWED_CARD_ID });
    const controller = new PublishedKnowledgeCardsController({
      getPublished,
    } as unknown as KnowledgeCardsService);

    await controller.get({ user: { physicianId: PHYSICIAN_ID } }, REVIEWED_CARD_ID);

    expect(getPublished).toHaveBeenCalledWith(PHYSICIAN_ID, REVIEWED_CARD_ID);
  });
});

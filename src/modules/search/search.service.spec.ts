import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { PrismaService } from '../../config/prisma.service';
import type { GuidelinesService } from '../guidelines/guidelines.service';
import { reviewedCard, reviewedCardRow } from '../../../tests/fixtures/reviewed-cards';
import { REVIEWED_CARD_SELECT } from '../knowledge-cards/card-retrieval/reviewed-card-view';
import { UnifiedSearchController } from './search.controller';
import { UnifiedSearchService, maskedSearchText } from './search.service';
import { unifiedSearchQuerySchema } from './schemas/search.schemas';

vi.mock('@sentry/node', () => ({ captureMessage: vi.fn() }));

const PHYSICIAN_ID = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';
const INSTITUTION_ID = 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii';
const OTHER_INSTITUTION_ID = 'oooooooo-oooo-4ooo-8ooo-oooooooooooo';
const CARD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CARD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CASE_1 = '11111111-1111-4111-8111-111111111111';
const CASE_2 = '22222222-2222-4222-8222-222222222222';
/** CPF válido de exemplo: o filtro de PII só mascara CPF com dígito verificador certo. */
const CPF = '529.982.247-25';

/** 15/10/2026, 10h em Brasília. */
const NOW = new Date('2026-10-15T13:00:00.000Z');

interface CardCandidateRow {
  id: string;
  topic: string;
  question: string;
  syndrome: string | null;
  sourceKey: string | null;
}

function cardCandidate(overrides: Partial<CardCandidateRow> = {}): CardCandidateRow {
  return {
    id: CARD_A,
    topic: 'Anafilaxia no adulto',
    question: 'Qual a dose de adrenalina IM na anafilaxia?',
    syndrome: 'reacao-alergica',
    sourceKey: null,
    ...overrides,
  };
}

function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join('?');
}

describe('UnifiedSearchService — busca única do ⌘K (CC-502)', () => {
  let memberships: ReturnType<typeof vi.fn>;
  let queryRaw: ReturnType<typeof vi.fn>;
  let cardRows: ReturnType<typeof vi.fn>;
  let chunkTitles: ReturnType<typeof vi.fn>;
  let encounters: ReturnType<typeof vi.fn>;
  let searchChunks: ReturnType<typeof vi.fn>;
  let cardCandidates: CardCandidateRow[];
  let syndromeRows: Array<{ encounterId: string; syndrome: string }>;
  let service: UnifiedSearchService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    cardCandidates = [cardCandidate()];
    syndromeRows = [];
    memberships = vi.fn().mockResolvedValue([{ institutionId: INSTITUTION_ID }]);
    queryRaw = vi.fn((strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join('?').includes('knowledge_cards') ? cardCandidates : syndromeRows,
      ),
    );
    cardRows = vi
      .fn()
      .mockResolvedValue([reviewedCardRow({ id: CARD_A, topic: 'Anafilaxia no adulto' })]);
    chunkTitles = vi.fn().mockResolvedValue([]);
    encounters = vi.fn().mockResolvedValue([]);
    searchChunks = vi.fn().mockResolvedValue([]);
    service = new UnifiedSearchService(
      {
        physicianInstitution: { findMany: memberships },
        $queryRaw: queryRaw,
        knowledgeCard: { findMany: cardRows },
        guidelineChunk: { findMany: chunkTitles },
        encounter: { findMany: encounters },
      } as unknown as PrismaService,
      { searchChunks } as unknown as GuidelinesService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  function cardQueries(): unknown[][] {
    return queryRaw.mock.calls.filter((call) => sqlOf(call).includes('knowledge_cards'));
  }

  function syndromeQueries(): unknown[][] {
    return queryRaw.mock.calls.filter((call) => sqlOf(call).includes('ai_interactions'));
  }

  describe('cartões', () => {
    it('acha o cartão publicado pelo tema e devolve a pergunta da versão assinada', async () => {
      const result = await service.search(PHYSICIAN_ID, { q: 'anafilaxia', limit: 5 });

      expect(result.cards).toEqual({
        status: 'ok',
        items: [
          {
            id: CARD_A,
            topic: 'Anafilaxia no adulto',
            question: reviewedCard().content.question,
            syndrome: 'febre',
          },
        ],
      });
      expect(cardRows).toHaveBeenCalledWith({
        where: { id: { in: [CARD_A] } },
        select: REVIEWED_CARD_SELECT,
      });
    });

    it('só lê cartão global ou da instituição do médico, aprovado, válido e de revisor verificado', async () => {
      await service.search(PHYSICIAN_ID, { q: 'anafilaxia', limit: 5 });

      expect(memberships).toHaveBeenCalledWith({
        where: { physicianId: PHYSICIAN_ID },
        select: { institutionId: true },
      });
      const [call] = cardQueries();
      const sql = sqlOf(call!);
      expect(sql).toContain("kc.status = 'published'");
      expect(sql).toContain("kv.review_decision = 'approved'");
      expect(sql).toContain('kv.valid_until > ?');
      expect(sql).toContain('p.crm_verified = true');
      expect(sql).toContain('kc.institution_id IS NULL OR kc.institution_id = ANY(?::uuid[])');
      expect(call!.slice(1)).toEqual([NOW, [INSTITUTION_ID]]);
    });

    it('deixa de fora o que não passa na regra do cartão publicado, mesmo que a busca tenha achado', async () => {
      cardCandidates = [
        cardCandidate({ id: CARD_A }),
        cardCandidate({ id: CARD_B, topic: 'Anafilaxia na criança' }),
      ];
      cardRows.mockResolvedValue([
        // Outra instituição (a consulta já filtra; aqui é a segunda barreira).
        reviewedCardRow({ id: CARD_A, institutionId: OTHER_INSTITUTION_ID }),
        // Revisor perdeu a verificação do CRM.
        {
          ...reviewedCardRow({ id: CARD_B }),
          publishedVersion: {
            ...reviewedCardRow().publishedVersion!,
            reviewer: { ...reviewedCardRow().publishedVersion!.reviewer!, crmVerified: false },
          },
        },
      ]);

      const result = await service.search(PHYSICIAN_ID, { q: 'anafilaxia', limit: 5 });

      expect(result.cards).toEqual({ status: 'ok', items: [] });
    });

    it('respeita o limite por grupo', async () => {
      cardCandidates = [cardCandidate({ id: CARD_A }), cardCandidate({ id: CARD_B })];
      cardRows.mockResolvedValue([
        reviewedCardRow({ id: CARD_A }),
        reviewedCardRow({ id: CARD_B }),
      ]);

      const result = await service.search(PHYSICIAN_ID, { q: 'anafilaxia', limit: 1 });

      expect(result.cards.status === 'ok' && result.cards.items).toHaveLength(1);
    });

    it('não confere nada quando nenhum cartão casa', async () => {
      const result = await service.search(PHYSICIAN_ID, { q: 'escorpião', limit: 5 });

      expect(result.cards).toEqual({ status: 'ok', items: [] });
      expect(cardRows).not.toHaveBeenCalled();
    });
  });

  describe('protocolos', () => {
    it('um por documento: primeiro pelo título, depois pela busca por palavra que já existe', async () => {
      chunkTitles.mockResolvedValue([
        {
          source: 'Protocolo de anafilaxia',
          sourceVersion: '2025',
          specialty: 'clinica_medica',
          institutionId: INSTITUTION_ID,
        },
      ]);
      searchChunks.mockResolvedValue([
        {
          source: 'Protocolo de anafilaxia',
          sourceVersion: '2025',
          specialty: 'clinica_medica',
          institutionId: INSTITUTION_ID,
        },
        {
          source: 'PCDT Urticária',
          sourceVersion: '1.0',
          specialty: 'dermatologia',
          institutionId: null,
        },
        {
          source: 'PCDT Urticária',
          sourceVersion: '1.0',
          specialty: 'dermatologia',
          institutionId: null,
        },
      ]);

      const result = await service.search(PHYSICIAN_ID, { q: 'anafilaxia', limit: 5 });

      expect(result.protocols).toEqual({
        status: 'ok',
        items: [
          {
            source: 'Protocolo de anafilaxia',
            sourceVersion: '2025',
            specialty: 'clinica_medica',
            institutional: true,
          },
          {
            source: 'PCDT Urticária',
            sourceVersion: '1.0',
            specialty: 'dermatologia',
            institutional: false,
          },
        ],
      });
    });

    it('só a base pública e a instituição do médico, nos dois caminhos', async () => {
      await service.search(PHYSICIAN_ID, { q: 'anafilaxia', limit: 3 });

      expect(chunkTitles).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'approved',
            validTo: null,
            OR: [{ institutionId: null }, { institutionId: { in: [INSTITUTION_ID] } }],
          }),
          take: 3,
        }),
      );
      expect(searchChunks).toHaveBeenCalledWith('anafilaxia', undefined, 40, [INSTITUTION_ID]);
    });
  });

  describe('casos', () => {
    it('só os do médico, pelo rótulo ou pela síndrome do último entendimento', async () => {
      syndromeRows = [{ encounterId: CASE_1, syndrome: 'dor-toracica' }];
      encounters.mockResolvedValue([
        {
          id: CASE_1,
          patientRef: 'Leito 4',
          chiefComplaint: 'Dor torácica há 2 h',
          status: 'in_review',
          createdAt: new Date('2026-10-14T20:00:00.000Z'),
        },
      ]);

      const result = await service.search(PHYSICIAN_ID, { q: 'dor tor', limit: 5 });

      expect(encounters).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            physicianId: PHYSICIAN_ID,
            OR: [
              { patientRef: { contains: 'dor tor', mode: 'insensitive' } },
              { id: { in: [CASE_1] } },
            ],
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      );
      const [call] = syndromeQueries();
      expect(sqlOf(call!)).toContain('e.physician_id = ?::uuid');
      expect(call).toContainEqual(PHYSICIAN_ID);
      expect(JSON.stringify(call)).toContain('dor-toracica');
      expect(result.cases).toEqual({
        status: 'ok',
        items: [
          {
            id: CASE_1,
            patientRef: 'Leito 4',
            chiefComplaint: 'Dor torácica há 2 h',
            status: 'in_review',
            createdAt: '2026-10-14T20:00:00.000Z',
            syndrome: 'dor-toracica',
          },
        ],
      });
    });

    it('a data filtra o dia em Brasília; o caso achado pela data ganha a síndrome dele', async () => {
      encounters.mockResolvedValue([
        {
          id: CASE_2,
          patientRef: null,
          chiefComplaint: null,
          status: 'draft',
          createdAt: new Date('2026-10-12T12:00:00.000Z'),
        },
      ]);
      syndromeRows = [{ encounterId: CASE_2, syndrome: 'febre' }];

      const result = await service.search(PHYSICIAN_ID, { q: '12/10', limit: 5 });

      expect(encounters).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            physicianId: PHYSICIAN_ID,
            createdAt: {
              gte: new Date('2026-10-12T03:00:00.000Z'),
              lt: new Date('2026-10-13T03:00:00.000Z'),
            },
          },
        }),
      );
      // Só a consulta da síndrome dos casos achados, também restrita ao médico.
      const calls = syndromeQueries();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContainEqual(PHYSICIAN_ID);
      expect(JSON.stringify(calls[0])).toContain(CASE_2);
      expect(result.cases.status === 'ok' && result.cases.items[0]?.syndrome).toBe('febre');
    });

    it('síndrome desconhecida no banco não vai para a tela', async () => {
      encounters.mockResolvedValue([
        {
          id: CASE_2,
          patientRef: 'Box 2',
          chiefComplaint: null,
          status: 'draft',
          createdAt: new Date('2026-10-12T12:00:00.000Z'),
        },
      ]);
      syndromeRows = [{ encounterId: CASE_2, syndrome: 'inventada' }];

      const result = await service.search(PHYSICIAN_ID, { q: 'box', limit: 5 });

      expect(result.cases.status === 'ok' && result.cases.items[0]?.syndrome).toBeNull();
    });
  });

  describe('máscara e log', () => {
    it('cartões e protocolos recebem a busca sem o dado pessoal', async () => {
      await service.search(PHYSICIAN_ID, { q: `anafilaxia ${CPF}`, limit: 5 });

      expect(searchChunks).toHaveBeenCalledWith('anafilaxia', undefined, 40, [INSTITUTION_ID]);
      expect(chunkTitles).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: { contains: 'anafilaxia', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('sem texto depois da máscara, cartões e protocolos nem consultam', async () => {
      const result = await service.search(PHYSICIAN_ID, { q: CPF, limit: 5 });

      expect(result.cards).toEqual({ status: 'ok', items: [] });
      expect(result.protocols).toEqual({ status: 'ok', items: [] });
      expect(cardQueries()).toHaveLength(0);
      expect(searchChunks).not.toHaveBeenCalled();
      expect(chunkTitles).not.toHaveBeenCalled();
    });

    it('o log diz tamanho, máscara e contagens — nunca a busca', async () => {
      const log = vi.mocked(Logger.prototype.log);

      await service.search(PHYSICIAN_ID, { q: `Leito 4 ${CPF}`, limit: 5 });

      const lines = log.mock.calls.map(([line]) => String(line));
      expect(lines).toEqual([
        expect.stringMatching(
          /^UNIFIED_SEARCH chars=\d+ masked=true cards=0 protocols=0 cases=0 ms=\d+$/,
        ),
      ]);
      expect(lines.join('\n')).not.toMatch(/Leito|529/);
    });

    it('um grupo que falha vira erro só nele, e o Sentry não recebe a busca', async () => {
      encounters.mockRejectedValue(new Error(`invalid input "Leito 4"`));

      const result = await service.search(PHYSICIAN_ID, { q: 'Leito 4', limit: 5 });

      expect(result.cases).toEqual({ status: 'error' });
      expect(result.cards.status).toBe('ok');
      expect(result.protocols.status).toBe('ok');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'UNIFIED_SEARCH_FAILED group=cases kind=Error',
        'error',
      );
      const errors = vi.mocked(Logger.prototype.error).mock.calls.map(([line]) => String(line));
      expect(errors.join('\n')).not.toContain('Leito');
    });

    it('sem a lista de instituições, cartões e protocolos falham e casos seguem', async () => {
      memberships.mockRejectedValue(new Error('db down'));

      const result = await service.search(PHYSICIAN_ID, { q: 'anafilaxia', limit: 5 });

      expect(result.cards).toEqual({ status: 'error' });
      expect(result.protocols).toEqual({ status: 'error' });
      expect(result.cases.status).toBe('ok');
    });
  });

  it('maskedSearchText tira o dado pessoal e a marca da máscara', () => {
    expect(maskedSearchText(`dose ${CPF} adrenalina`)).toEqual({
      text: 'dose adrenalina',
      masked: true,
    });
    expect(maskedSearchText('anafilaxia')).toEqual({ text: 'anafilaxia', masked: false });
  });
});

describe('GET /search — query e controller (CC-502)', () => {
  it('apara a busca, exige 2 a 100 caracteres e limita os itens por grupo', () => {
    expect(unifiedSearchQuerySchema.parse({ q: '  nora  ' })).toEqual({ q: 'nora', limit: 5 });
    expect(unifiedSearchQuerySchema.parse({ q: 'nora', limit: '10' })).toEqual({
      q: 'nora',
      limit: 10,
    });
    expect(unifiedSearchQuerySchema.safeParse({ q: ' a ' }).success).toBe(false);
    expect(unifiedSearchQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(unifiedSearchQuerySchema.safeParse({ q: 'nora', limit: '11' }).success).toBe(false);
    expect(unifiedSearchQuerySchema.safeParse({}).success).toBe(false);
  });

  it('o controller busca como o médico autenticado', async () => {
    const search = vi.fn().mockResolvedValue({});
    const controller = new UnifiedSearchController({ search } as unknown as UnifiedSearchService);

    await controller.find({ user: { physicianId: PHYSICIAN_ID } }, { q: 'nora', limit: 5 });

    expect(search).toHaveBeenCalledWith(PHYSICIAN_ID, { q: 'nora', limit: 5 });
  });
});

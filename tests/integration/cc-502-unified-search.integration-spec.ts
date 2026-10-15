/**
 * Testes de integração — CC-502: busca única do ⌘K (`GET /search`).
 *
 * Requisito: banco PostgreSQL com as migrations aplicadas, via DATABASE_URL.
 *
 * Cobre o que os testes unitários não alcançam: as consultas de verdade —
 * quem vê qual cartão (instituição, validade, CRM do revisor, arquivado), o
 * filtro de instituição dos protocolos antes do LIMIT, e a síndrome do
 * último entendimento lida do JSON da análise, só nos casos do médico.
 * Nenhuma chamada de IA.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import type { PrismaService } from '../../src/config/prisma.service';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type { AuditService } from '../../src/modules/audit/audit.service';
import { GuidelinesService } from '../../src/modules/guidelines/guidelines.service';
import { UnifiedSearchService } from '../../src/modules/search/search.service';
import { storedCardContent } from '../fixtures/knowledge-cards';

const EMAIL_DOMAIN = '@cc502.test';
const PREFIX = 'CC-502 ';
const YEAR_MS = 365 * 24 * 3600 * 1000;

describe('CC-502 — busca única do ⌘K (integration)', () => {
  let prisma: PrismaClient;
  let service: UnifiedSearchService;
  let physicianId: string;
  let otherPhysicianId: string;
  let reviewerId: string;
  let unverifiedReviewerId: string;
  let institutionId: string;
  let otherInstitutionId: string;
  const { content, contentSha256 } = storedCardContent();

  async function cleanUp(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_cards SET status = 'archived', archived_at = now(), published_version_id = NULL
        WHERE topic LIKE '${PREFIX}%'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_card_versions
        WHERE card_id IN (SELECT id FROM knowledge_cards WHERE topic LIKE '${PREFIX}%')`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM knowledge_cards WHERE topic LIKE '${PREFIX}%'`);
    await prisma.guidelineChunk.deleteMany({ where: { source: { startsWith: PREFIX } } });
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await prisma.institution.deleteMany({ where: { name: { startsWith: PREFIX } } });
  }

  async function physician(name: string, crmVerified = true): Promise<string> {
    const created = await prisma.physician.create({
      data: {
        email: `${name}-${Date.now()}${EMAIL_DOMAIN}`,
        passwordHash: 'x',
        name,
        crmUf: 'SP',
        crmNumber: `0502${Math.floor(Math.random() * 1e6)}`,
        crmVerified,
      },
    });
    return created.id;
  }

  async function publishedCard(
    topic: string,
    options: {
      institutionId?: string | null;
      reviewerId?: string;
      validUntil?: Date;
      archived?: boolean;
    } = {},
  ): Promise<string> {
    const reviewer = options.reviewerId ?? reviewerId;
    const card = await prisma.knowledgeCard.create({
      data: {
        topic: `${PREFIX}${topic}`,
        syndrome: 'reacao-alergica',
        institutionId: options.institutionId ?? null,
        status: 'in_review',
        currentVersion: 1,
      },
    });
    const version = await prisma.knowledgeCardVersion.create({
      data: {
        cardId: card.id,
        version: 1,
        content: content as object,
        contentSha256,
        authorKind: 'physician',
        authorPhysicianId: reviewer,
        reviewDecision: 'approved',
        reviewerId: reviewer,
        reviewedAt: new Date(),
        validUntil: options.validUntil ?? new Date(Date.now() + YEAR_MS),
      },
    });
    await prisma.knowledgeCard.update({
      where: { id: card.id },
      data: {
        status: options.archived ? 'archived' : 'published',
        publishedVersionId: version.id,
        ...(options.archived ? { archivedAt: new Date() } : {}),
      },
    });
    return card.id;
  }

  async function guidelineChunk(
    source: string,
    text: string,
    options: { institutionId?: string | null; status?: 'approved' | 'pending_review' } = {},
  ): Promise<void> {
    await prisma.guidelineChunk.create({
      data: {
        source: `${PREFIX}${source}`,
        sourceVersion: '2025',
        specialty: 'clinica_medica',
        text,
        status: options.status ?? 'approved',
        institutionId: options.institutionId ?? null,
      },
    });
  }

  /** Caso do médico com as análises na ordem dada (a última é a mais recente). */
  async function encounter(
    owner: string,
    patientRef: string | null,
    analyses: Array<Record<string, unknown>>,
  ): Promise<string> {
    const created = await prisma.encounter.create({
      data: { physicianId: owner, patientRef, vertical: 'general' },
    });
    let at = Date.now() - analyses.length * 60_000;
    for (const rawOutput of analyses) {
      await prisma.aiInteraction.create({
        data: {
          encounterId: created.id,
          model: 'fake',
          rawOutput: rawOutput as object,
          latencyMs: 1,
          createdAt: new Date((at += 60_000)),
        },
      });
    }
    return created.id;
  }

  const understood = (syndrome: string) => ({ understanding: { syndrome }, recommendations: [] });
  const validationFailure = { raw: '{}', validationErrors: ['schema'] };

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await cleanUp();
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await cleanUp();
    physicianId = await physician('medico');
    otherPhysicianId = await physician('outro-medico');
    reviewerId = await physician('revisora');
    unverifiedReviewerId = await physician('revisor-sem-crm', false);
    institutionId = (await prisma.institution.create({ data: { name: `${PREFIX}Hospital` } })).id;
    otherInstitutionId = (await prisma.institution.create({ data: { name: `${PREFIX}Outro` } }))
      .id;
    await prisma.physicianInstitution.create({ data: { physicianId, institutionId } });

    const guidelines = new GuidelinesService(
      prisma as unknown as PrismaService,
      {} as AiGatewayService,
      {} as AuditService,
    );
    service = new UnifiedSearchService(prisma as unknown as PrismaService, guidelines);
  });

  it('cartões: globais e da instituição do médico, aprovados, válidos e de revisor verificado', async () => {
    const global = await publishedCard('Anafilaxia no adulto');
    const mine = await publishedCard('Anafilaxia no hospital', { institutionId });
    await publishedCard('Anafilaxia de outro hospital', { institutionId: otherInstitutionId });
    await publishedCard('Anafilaxia vencida', { validUntil: new Date(Date.now() - 60_000) });
    await publishedCard('Anafilaxia sem CRM', { reviewerId: unverifiedReviewerId });
    await publishedCard('Anafilaxia arquivada', { archived: true });

    const result = await service.search(physicianId, { q: 'cc-502 anafilaxia', limit: 10 });

    expect(result.cards.status).toBe('ok');
    if (result.cards.status !== 'ok') return;
    expect(result.cards.items.map(({ id }) => id).sort()).toEqual([global, mine].sort());
    expect(result.cards.items[0]).toMatchObject({
      question: content.question,
      syndrome: 'reacao-alergica',
    });
  });

  it('protocolos: um por documento, pelo título ou pelo texto, sem os de outra instituição', async () => {
    // Um agravo raro: a base que outro teste deixou no banco não disputa o LIMIT.
    await guidelineChunk('Protocolo de escombroidose', 'Escombroidose: anti-histamínico.');
    await guidelineChunk('Protocolo de escombroidose', 'Escombroidose: observar broncoespasmo.');
    await guidelineChunk('Intoxicação por peixe', 'Peixe mal conservado causa escombroidose.', {
      institutionId,
    });
    await guidelineChunk('Escombroidose de outro hospital', 'Escombroidose: protocolo deles.', {
      institutionId: otherInstitutionId,
    });
    await guidelineChunk('Escombroidose em revisão', 'Escombroidose ainda não aprovada.', {
      status: 'pending_review',
    });

    const result = await service.search(physicianId, { q: 'escombroidose', limit: 10 });

    expect(result.protocols.status).toBe('ok');
    if (result.protocols.status !== 'ok') return;
    expect(result.protocols.items.map(({ source }) => source).sort()).toEqual(
      [`${PREFIX}Intoxicação por peixe`, `${PREFIX}Protocolo de escombroidose`].sort(),
    );
    expect(
      result.protocols.items.find(({ source }) => source.endsWith('Intoxicação por peixe')),
    ).toMatchObject({ institutional: true });
  });

  it('casos: só os do médico, pela síndrome do último entendimento, pelo rótulo e pela data', async () => {
    const allergic = await encounter(physicianId, 'CC502-Leito-4', [
      understood('reacao-alergica'),
      // A análise mais recente falhou na validação: vale o último entendimento.
      validationFailure,
    ]);
    const changed = await encounter(physicianId, 'CC502-Box-2', [
      understood('dor-toracica'),
      understood('dispneia'),
    ]);
    await encounter(otherPhysicianId, 'CC502-Leito-9', [understood('reacao-alergica')]);

    const bySyndrome = await service.search(physicianId, { q: 'anafilaxia', limit: 10 });
    expect(bySyndrome.cases).toEqual({
      status: 'ok',
      items: [expect.objectContaining({ id: allergic, syndrome: 'reacao-alergica' })],
    });

    // A síndrome que o entendimento corrigido deixou para trás não acha o caso.
    const oldSyndrome = await service.search(physicianId, { q: 'dor torácica', limit: 10 });
    expect(oldSyndrome.cases).toEqual({ status: 'ok', items: [] });

    const byLabel = await service.search(physicianId, { q: 'cc502-', limit: 10 });
    expect(byLabel.cases.status === 'ok' && byLabel.cases.items.map(({ id }) => id).sort()).toEqual(
      [allergic, changed].sort(),
    );
    expect(
      byLabel.cases.status === 'ok' && byLabel.cases.items.find(({ id }) => id === changed),
    ).toMatchObject({ syndrome: 'dispneia' });

    const byDay = await service.search(physicianId, { q: 'hoje', limit: 10 });
    expect(byDay.cases.status === 'ok' && byDay.cases.items.map(({ id }) => id).sort()).toEqual(
      [allergic, changed].sort(),
    );
  });
});

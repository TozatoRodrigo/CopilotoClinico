/**
 * Testes de integração — CC-020: só curador ou ADMIN escreve protocolo.
 *
 * Antes, qualquer médico autenticado criava, publicava ou criava versão nova
 * de protocolo global. Cada ato é chamado como o médico, pelo controller com
 * os serviços reais, o banco real e a trilha de auditoria real. Papéis:
 *
 * - médico sem papel, com vínculo com a instituição A;
 * - curador, com vínculo com A;
 * - ADMIN sem a flag de curador e sem vínculo com A.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations
 * aplicadas.
 */
import { randomUUID } from 'crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { clearAuditLog, connectTestDb, disconnectTestDb } from './helpers/db';
import { AuditService } from '../../src/modules/audit/audit.service';
import { InstitutionsService } from '../../src/modules/institutions/institutions.service';
import { ProtocolsController } from '../../src/modules/protocols/protocols.controller';
import { ProtocolsService } from '../../src/modules/protocols/protocols.service';
import type { CreateProtocolInput } from '../../src/modules/protocols/schemas/protocol.schemas';
import type { PrismaService } from '../../src/config/prisma.service';

const SPECIALTY = 'cc020_autoria';
const PROTOCOL_PREFIX = 'CC-020 protocolo';
const EMAIL_DOMAIN = '@cc020.invalid';

function graph(name: string, institutionId?: string): CreateProtocolInput {
  return {
    name: `${PROTOCOL_PREFIX} ${name}`,
    specialty: SPECIALTY,
    institutionId,
    nodes: [
      {
        id: 'q1',
        nodeType: 'question',
        order: 0,
        content: { question: 'Lactato acima de 4?', answerType: 'boolean' },
      },
      { id: 'a1', nodeType: 'action', order: 1, content: { action: 'Expandir volume' } },
      { id: 'o1', nodeType: 'outcome', order: 2, content: { outcome: 'Reavaliar' } },
    ],
    edges: [
      { fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true } },
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: false } },
      { fromNodeId: 'a1', toNodeId: 'o1', condition: null },
    ],
  };
}

function asPhysician(physicianId: string) {
  return { user: { physicianId } };
}

describe('CC-020 — só curador ou ADMIN escreve protocolo (integration)', () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let protocols: ProtocolsController;
  let institutionA: string;
  let plain: string;
  let curator: string;
  let admin: string;

  async function createPhysician(
    label: string,
    data: { role?: Role; isCurator?: boolean } = {},
  ): Promise<string> {
    const suffix = randomUUID();
    const physician = await prisma.physician.create({
      data: {
        crmUf: 'SP',
        crmNumber: suffix.slice(0, 8),
        email: `${label}-${suffix}${EMAIL_DOMAIN}`,
        passwordHash: 'nao-usado',
        ...data,
      },
    });
    return physician.id;
  }

  /** Protocolo montado pelo curador, já no estado pedido. */
  async function protocolBy(
    name: string,
    status: 'draft' | 'published',
    institutionId?: string,
  ): Promise<string> {
    const { id } = await protocols.create(asPhysician(curator), graph(name, institutionId));
    if (status === 'published') await protocols.publish(asPhysician(curator), id);
    return id;
  }

  function versionsOf(name: string): Promise<number> {
    return prisma.protocol.count({ where: { name: `${PROTOCOL_PREFIX} ${name}` } });
  }

  async function statusOf(id: string): Promise<string | undefined> {
    return (await prisma.protocol.findUnique({ where: { id } }))?.status;
  }

  function auditOf(actorId: string) {
    return prisma.auditLog.findMany({
      where: { actorId, entity: 'Protocol' },
      orderBy: { createdAt: 'asc' },
    });
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    const db = prisma as unknown as PrismaService;
    audit = new AuditService(db);

    institutionA = (await prisma.institution.create({ data: { name: 'CC-020 Hospital A' } })).id;
    plain = await createPhysician('medico');
    curator = await createPhysician('curador', { isCurator: true });
    admin = await createPhysician('admin', { role: Role.ADMIN });
    await prisma.physicianInstitution.createMany({
      data: [
        { physicianId: plain, institutionId: institutionA },
        { physicianId: curator, institutionId: institutionA },
      ],
    });

    protocols = new ProtocolsController(
      new ProtocolsService(db, audit),
      new InstitutionsService(db, audit),
    );
  });

  afterAll(async () => {
    await prisma.protocol.deleteMany({ where: { name: { startsWith: PROTOCOL_PREFIX } } });
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await prisma.institution.deleteMany({ where: { id: institutionA } });
    await clearAuditLog(prisma);
    await disconnectTestDb();
  });

  describe('médico sem papel de curador nem ADMIN', () => {
    it('não cria, não publica nem revisa protocolo global: 403 e nada muda', async () => {
      const draft = await protocolBy('global rascunho', 'draft');
      const published = await protocolBy('global publicado', 'published');

      await expect(protocols.create(asPhysician(plain), graph('global do médico'))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(protocols.publish(asPhysician(plain), draft)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        protocols.revise(asPhysician(plain), published, graph('ignorado')),
      ).rejects.toThrow(ForbiddenException);

      expect(await versionsOf('global do médico')).toBe(0);
      expect(await statusOf(draft)).toBe('draft');
      expect(await versionsOf('global publicado')).toBe(1);
      expect(await auditOf(plain)).toHaveLength(0);
    });

    it('nem o da própria instituição, mesmo com vínculo ativo', async () => {
      const draft = await protocolBy('A rascunho', 'draft', institutionA);
      const published = await protocolBy('A publicado', 'published', institutionA);

      await expect(
        protocols.create(asPhysician(plain), graph('A do médico', institutionA)),
      ).rejects.toThrow(ForbiddenException);
      await expect(protocols.publish(asPhysician(plain), draft)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        protocols.revise(asPhysician(plain), published, graph('ignorado')),
      ).rejects.toThrow(ForbiddenException);

      expect(await versionsOf('A do médico')).toBe(0);
      expect(await statusOf(draft)).toBe('draft');
      expect(await versionsOf('A publicado')).toBe(1);
      expect(await auditOf(plain)).toHaveLength(0);
    });

    it('continua lendo o protocolo publicado (ler não é escrever)', async () => {
      const published = await protocolBy('global para ler', 'published');

      await expect(protocols.findOne(asPhysician(plain), published)).resolves.toMatchObject({
        id: published,
        status: 'published',
      });
    });
  });

  describe('curador', () => {
    it('cria, publica e revisa protocolo global; cada ato fica na auditoria com o papel', async () => {
      const created = await protocols.create(asPhysician(curator), graph('global do curador'));
      const published = await protocols.publish(asPhysician(curator), created.id);
      const revised = await protocols.revise(asPhysician(curator), created.id, graph('ignorado'));

      expect(published.status).toBe('published');
      expect(revised).toMatchObject({ version: 2, status: 'draft', institutionId: null });

      const trail = (await auditOf(curator)).filter((row) =>
        [created.id, revised.id].includes(row.entityId),
      );
      expect(trail.map((row) => [row.action, row.entityId])).toEqual([
        ['PROTOCOL_CREATED', created.id],
        ['PROTOCOL_PUBLISHED', created.id],
        ['PROTOCOL_CREATED', revised.id],
        ['PROTOCOL_REVISED', revised.id],
      ]);
      for (const row of trail) {
        expect(row.payload).toMatchObject({ authorizedAs: 'curator' });
      }
      // Nada do médico além do id de ator de sempre: sem e-mail, nome ou CRM.
      const curatorRow = await prisma.physician.findUniqueOrThrow({ where: { id: curator } });
      const payloads = JSON.stringify(trail.map((row) => row.payload));
      expect(payloads).not.toContain(curatorRow.email);
      expect(payloads).not.toContain(curatorRow.crmNumber);
      expect(payloads).not.toContain(curator);
    });

    it('publica e revisa o protocolo da instituição com que tem vínculo ativo', async () => {
      const draft = await protocolBy('A do curador', 'draft', institutionA);

      await expect(protocols.publish(asPhysician(curator), draft)).resolves.toMatchObject({
        status: 'published',
      });
      await expect(
        protocols.revise(asPhysician(curator), draft, graph('ignorado')),
      ).resolves.toMatchObject({ version: 2, institutionId: institutionA });
    });

    it('perder a flag vale no pedido seguinte, sem esperar o token expirar', async () => {
      const formerCurator = await createPhysician('ex-curador', { isCurator: true });
      const draft = (await protocols.create(asPhysician(formerCurator), graph('do ex-curador'))).id;

      await prisma.physician.update({ where: { id: formerCurator }, data: { isCurator: false } });

      await expect(protocols.publish(asPhysician(formerCurator), draft)).rejects.toThrow(
        ForbiddenException,
      );
      expect(await statusOf(draft)).toBe('draft');
    });
  });

  describe('ADMIN', () => {
    it('cria, publica e revisa protocolo global, com o papel na auditoria', async () => {
      const created = await protocols.create(asPhysician(admin), graph('global do admin'));
      await protocols.publish(asPhysician(admin), created.id);
      const revised = await protocols.revise(asPhysician(admin), created.id, graph('ignorado'));

      expect(revised).toMatchObject({ version: 2, institutionId: null });
      const trail = await auditOf(admin);
      expect(trail.map((row) => row.action)).toEqual([
        'PROTOCOL_CREATED',
        'PROTOCOL_PUBLISHED',
        'PROTOCOL_CREATED',
        'PROTOCOL_REVISED',
      ]);
      for (const row of trail) {
        expect(row.payload).toMatchObject({ authorizedAs: 'admin' });
      }
    });

    it('sem vínculo com a instituição, não vê nem escreve o protocolo dela (CC-019)', async () => {
      const draft = await protocolBy('A rascunho fora do admin', 'draft', institutionA);
      const published = await protocolBy('A publicado fora do admin', 'published', institutionA);

      await expect(protocols.publish(asPhysician(admin), draft)).rejects.toThrow(NotFoundException);
      await expect(
        protocols.revise(asPhysician(admin), published, graph('ignorado')),
      ).rejects.toThrow(NotFoundException);
      await expect(
        protocols.create(asPhysician(admin), graph('A do admin', institutionA)),
      ).rejects.toThrow(ForbiddenException);

      expect(await statusOf(draft)).toBe('draft');
      expect(await versionsOf('A publicado fora do admin')).toBe(1);
      expect(await versionsOf('A do admin')).toBe(0);
    });
  });
});

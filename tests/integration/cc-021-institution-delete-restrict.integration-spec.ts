/**
 * Testes de integração — CC-021: apagar instituição não torna global o
 * conteúdo dela.
 *
 * `institution_id IS NULL` é conteúdo global (ADR-009). Com ON DELETE SET NULL,
 * apagar a instituição publicava para todos os médicos o protocolo e a
 * diretriz internos dela. Agora o banco recusa o DELETE e nada muda.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (incluindo 20261015190000_cc_021_institution_delete_restrict).
 */
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';

const PREFIX = 'CC-021';

/** `confdeltype` de pg_constraint: a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL, d = SET DEFAULT. */
type OnDeleteCode = 'a' | 'r' | 'c' | 'n' | 'd';

interface InstitutionForeignKey {
  table: string;
  constraint: string;
  onDelete: OnDeleteCode;
}

/** O Prisma traduz a recusa da FK (SQLSTATE 23503) em P2003. */
async function expectDeleteRefused(prisma: PrismaClient, institutionId: string): Promise<void> {
  await expect(prisma.institution.delete({ where: { id: institutionId } })).rejects.toMatchObject({
    code: 'P2003',
  });
  await expect(prisma.institution.count({ where: { id: institutionId } })).resolves.toBe(1);
}

describe('CC-021 — apagar instituição (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterEach(async () => {
    // Ordem das dependências: o conteúdo antes da instituição, que agora recusa.
    await prisma.physician.deleteMany({ where: { email: { endsWith: '@cc021.test' } } });
    await prisma.protocol.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.guidelineChunk.deleteMany({ where: { source: { startsWith: PREFIX } } });
    await prisma.institution.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  async function createInstitution(label: string): Promise<string> {
    const institution = await prisma.institution.create({ data: { name: `${PREFIX} ${label}` } });
    return institution.id;
  }

  async function createPhysician(): Promise<string> {
    const physician = await prisma.physician.create({
      data: {
        email: `medico-${randomUUID()}@cc021.test`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '000021',
      },
    });
    return physician.id;
  }

  it('nenhuma FK para institutions usa SET NULL: o conteúdo institucional nunca vira global', async () => {
    const foreignKeys = await prisma.$queryRaw<InstitutionForeignKey[]>`
      SELECT con.conrelid::regclass::text AS "table",
             con.conname AS "constraint",
             con.confdeltype::text AS "onDelete"
        FROM pg_constraint con
       WHERE con.contype = 'f'
         AND con.confrelid = 'public.institutions'::regclass
       ORDER BY 1`;

    const byTable = Object.fromEntries(foreignKeys.map((fk) => [fk.table, fk.onDelete]));
    expect(byTable).toMatchObject({
      protocols: 'r',
      guideline_chunks: 'r',
      encounters: 'r',
      physician_institutions: 'c',
    });
    // Vale também para FKs que outras tabelas criarem depois: NULL é "global".
    expect(foreignKeys.filter((fk) => fk.onDelete === 'n' || fk.onDelete === 'd')).toEqual([]);
  });

  it('com protocolo: o banco recusa e o protocolo continua da instituição', async () => {
    const institutionId = await createInstitution('com protocolo');
    const protocol = await prisma.protocol.create({
      data: {
        name: `${PREFIX} sepse interno`,
        specialty: 'emergencia',
        status: 'published',
        institutionId,
        createdBy: randomUUID(),
      },
    });

    await expectDeleteRefused(prisma, institutionId);

    const after = await prisma.protocol.findUniqueOrThrow({ where: { id: protocol.id } });
    expect(after.institutionId).toBe(institutionId);
  });

  it('com trecho de diretriz: o banco recusa e o trecho continua da instituição', async () => {
    const institutionId = await createInstitution('com diretriz');
    const chunk = await prisma.guidelineChunk.create({
      data: {
        source: `${PREFIX} diretriz interna`,
        sourceVersion: '1.0',
        specialty: 'clinica',
        evidenceLevel: 'A',
        text: 'Protocolo institucional de sepse.',
        status: 'approved',
        institutionId,
        metadata: {},
      },
    });

    await expectDeleteRefused(prisma, institutionId);

    const after = await prisma.guidelineChunk.findUniqueOrThrow({ where: { id: chunk.id } });
    expect(after.institutionId).toBe(institutionId);
  });

  it('com atendimento: o banco recusa e o caso mantém a instituição', async () => {
    const institutionId = await createInstitution('com atendimento');
    const physicianId = await createPhysician();
    const encounter = await prisma.encounter.create({ data: { physicianId, institutionId } });

    await expectDeleteRefused(prisma, institutionId);

    const after = await prisma.encounter.findUniqueOrThrow({ where: { id: encounter.id } });
    expect(after.institutionId).toBe(institutionId);
  });

  it('a recusa vale também para DELETE direto no banco, fora do Prisma Client', async () => {
    const institutionId = await createInstitution('DELETE direto');
    await prisma.protocol.create({
      data: {
        name: `${PREFIX} protocolo do DELETE direto`,
        specialty: 'emergencia',
        institutionId,
        createdBy: randomUUID(),
      },
    });

    await expect(
      prisma.$executeRaw`DELETE FROM "institutions" WHERE id = ${institutionId}::uuid`,
    ).rejects.toThrow(/protocols_institution_id_fkey/);
    await expect(prisma.institution.count({ where: { id: institutionId } })).resolves.toBe(1);
  });

  it('sem conteúdo: apagar continua funcionando e leva junto o vínculo dos médicos', async () => {
    const institutionId = await createInstitution('sem conteúdo');
    const physicianId = await createPhysician();
    await prisma.physicianInstitution.create({ data: { physicianId, institutionId } });

    await prisma.institution.delete({ where: { id: institutionId } });

    await expect(prisma.institution.count({ where: { id: institutionId } })).resolves.toBe(0);
    await expect(prisma.physicianInstitution.count({ where: { institutionId } })).resolves.toBe(0);
    await expect(prisma.physician.count({ where: { id: physicianId } })).resolves.toBe(1);
  });
});

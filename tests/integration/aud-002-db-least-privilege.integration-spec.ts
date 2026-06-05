/**
 * Testes de integração — AUD-002: role de banco de menor privilégio
 *
 * Referência: https://app.clickup.com/t/90132565680/86ahx6fqk
 *
 * O usuário/role da aplicação não deve ser dono das tabelas nem ter privilégios
 * destrutivos sobre audit_log. TRUNCATE e DROP precisam falhar no banco, não
 * apenas na camada da API.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';

const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ENTITY_ID = '00000000-0000-0000-0000-000000000002';

describe('AUD-002 — database least-privilege app role (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('RESET ROLE');
    await clearAuditLog(prisma);
  });

  it('provisiona a role da aplicacao sem privilegios administrativos', async () => {
    const roles = await prisma.$queryRaw<
      Array<{
        rolname: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
      }>
    >`
      SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication
      FROM pg_roles
      WHERE rolname = 'copiloto_app'
    `;

    expect(roles).toHaveLength(1);
    expect(roles[0]).toEqual({
      rolname: 'copiloto_app',
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
    });
  });

  it('permite INSERT em audit_log para a role da aplicacao', async () => {
    await prisma.$executeRawUnsafe('SET ROLE copiloto_app');

    await prisma.$executeRaw`
      INSERT INTO audit_log (
        id,
        actor_id,
        action,
        entity,
        entity_id,
        before_hash,
        after_hash,
        payload,
        ip
      )
      VALUES (
        '00000000-0000-0000-0000-000000000101'::uuid,
        ${TEST_ACTOR_ID},
        'AUD_002_INSERT_ALLOWED',
        'AuditLog',
        ${TEST_ENTITY_ID},
        NULL,
        ${'a'.repeat(64)},
        '{"allowed": true}'::jsonb,
        '127.0.0.1'
      )
    `;

    await prisma.$executeRawUnsafe('RESET ROLE');

    const inserted = await prisma.auditLog.findUniqueOrThrow({
      where: { id: '00000000-0000-0000-0000-000000000101' },
    });

    expect(inserted.action).toBe('AUD_002_INSERT_ALLOWED');
  });

  it('nega DELETE em audit_log para a role da aplicacao', async () => {
    const entry = await prisma.auditLog.create({
      data: {
        actorId: TEST_ACTOR_ID,
        action: 'AUD_002_DELETE_DENIED',
        entity: 'AuditLog',
        entityId: TEST_ENTITY_ID,
        beforeHash: null,
        afterHash: 'b'.repeat(64),
        payload: { denied: true },
        ip: '127.0.0.1',
      },
    });

    await prisma.$executeRawUnsafe('SET ROLE copiloto_app');

    await expect(
      prisma.$executeRaw`
        DELETE FROM audit_log WHERE id = ${entry.id}::uuid
      `,
    ).rejects.toThrow(/permission denied|append-only/i);
  });

  it('nega TRUNCATE em audit_log para a role da aplicacao', async () => {
    await prisma.$executeRawUnsafe('SET ROLE copiloto_app');

    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE audit_log')).rejects.toThrow(
      /permission denied|must be owner/i,
    );
  });

  it('nega DROP em audit_log para a role da aplicacao', async () => {
    await prisma.$executeRawUnsafe('SET ROLE copiloto_app');

    await expect(prisma.$executeRawUnsafe('DROP TABLE audit_log')).rejects.toThrow(
      /must be owner|permission denied/i,
    );
  });
});

/**
 * Testes de integração — AUD-006: Resiliência de concorrência da cadeia.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 * Referência: https://app.clickup.com/t/90132565680/86ahx6fv3
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';

const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ENTITY_ID = '00000000-0000-0000-0000-000000000002';

async function buildAuditService(prisma: PrismaClient) {
  const { AuditService } = await import('../../src/modules/audit/audit.service');
  return new AuditService(prisma as never);
}

describe('AUD-006 — concurrent audit chain writes (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearAuditLog(prisma);
  });

  it('mantem cadeia linear e verificavel com escritas concorrentes', async () => {
    const service = await buildAuditService(prisma);
    const totalEvents = 12;

    await Promise.all(
      Array.from({ length: totalEvents }, (_, index) =>
        service.log({
          actorId: TEST_ACTOR_ID,
          action: `CONCURRENT_${index}`,
          entity: 'Encounter',
          entityId: TEST_ENTITY_ID,
          payload: { index },
        }),
      ),
    );

    const result = await service.verifyChain();
    expect(result).toEqual({ valid: true, count: totalEvents });

    const duplicateLinks = await prisma.$queryRaw<Array<{ before_hash: string; count: bigint }>>`
      SELECT before_hash, COUNT(*)::bigint AS count
      FROM audit_log
      WHERE before_hash IS NOT NULL
      GROUP BY before_hash
      HAVING COUNT(*) > 1
    `;

    expect(duplicateLinks).toEqual([]);
  });
});

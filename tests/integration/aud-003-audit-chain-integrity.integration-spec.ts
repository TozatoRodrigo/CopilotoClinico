/**
 * Testes de integração — AUD-003: Verificação de integridade da cadeia de hash
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 * Referência: https://app.clickup.com/t/90132565680/86ahx6f8b
 *
 * Estes testes verificam que verifyChain() detecta corretamente:
 * - Cadeias íntegras (positivos)
 * - afterHash corrompido (falsificação de conteúdo)
 * - beforeHash corrompido (ruptura de elo na cadeia)
 * - Cadeia vazia (edge case)
 * - Performance básica com N registros (smoke test de paginação)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';

const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ENTITY_ID = '00000000-0000-0000-0000-000000000002';

// ── helpers de hash (mesma lógica do AuditService) ──────────────────
function computeAfterHash(entry: {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}): string {
  const data = {
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    payload: entry.payload,
    timestamp: entry.createdAt.toISOString(),
  };
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function computeBeforeHash(
  prevAfterHash: string,
  entry: { actorId: string; action: string; entity: string; entityId: string; payload: Record<string, unknown> | null; createdAt: Date },
): string {
  const data = {
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    payload: entry.payload,
    timestamp: entry.createdAt.toISOString(),
  };
  return createHash('sha256').update(prevAfterHash + JSON.stringify(data)).digest('hex');
}

// ── instancia AuditService com o Prisma real ─────────────────────────
async function buildAuditService(prisma: PrismaClient) {
  // Importação dinâmica para garantir que o PrismaClient de teste seja injetado
  const { AuditService } = await import('../../src/modules/audit/audit.service');
  return new AuditService(prisma as never);
}

describe('AUD-003 — verifyChain() integration (real PostgreSQL)', () => {
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

  // ─────────────────────────────────────────────────────────────────
  // Cenário 1: audit_log vazio → valid=true, count=0
  // ─────────────────────────────────────────────────────────────────
  it('retorna valid=true e count=0 para audit_log vazio', async () => {
    const service = await buildAuditService(prisma);

    const result = await service.verifyChain();

    expect(result).toEqual({ valid: true, count: 0 });
  });

  // ─────────────────────────────────────────────────────────────────
  // Cenário 2: cadeia íntegra com múltiplos registros
  // ─────────────────────────────────────────────────────────────────
  it('retorna valid=true para cadeia íntegra criada pelo AuditService', async () => {
    const service = await buildAuditService(prisma);

    // Inserir via service para garantir que os hashes sejam gerados corretamente
    await service.log({ actorId: TEST_ACTOR_ID, action: 'CREATE', entity: 'Encounter', entityId: TEST_ENTITY_ID });
    await service.log({ actorId: TEST_ACTOR_ID, action: 'UPDATE', entity: 'Encounter', entityId: TEST_ENTITY_ID });
    await service.log({ actorId: TEST_ACTOR_ID, action: 'CONFIRM', entity: 'Document', entityId: TEST_ENTITY_ID });

    const result = await service.verifyChain();

    expect(result.valid).toBe(true);
    expect(result.count).toBe(3);
    expect(result.brokenAt).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────
  // Cenário 3: afterHash corrompido → detectado como inválido
  // ─────────────────────────────────────────────────────────────────
  it('detecta afterHash corrompido e retorna valid=false com brokenAt', async () => {
    const service = await buildAuditService(prisma);

    await service.log({ actorId: TEST_ACTOR_ID, action: 'CREATE', entity: 'Encounter', entityId: TEST_ENTITY_ID });
    const [corrupted] = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM audit_log LIMIT 1`;

    // Corrompe via SQL direto no superuser de testes (o trigger bloqueia app role, não superuser)
    await prisma.$executeRawUnsafe(
      `UPDATE audit_log SET after_hash = '${'f'.repeat(64)}' WHERE id = '${corrupted!.id}'`,
    );

    const result = await service.verifyChain();

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(corrupted!.id);
    expect(result.message).toMatch(/afterHash mismatch/i);
  });

  // ─────────────────────────────────────────────────────────────────
  // Cenário 4: beforeHash corrompido → elo da cadeia rompido
  // ─────────────────────────────────────────────────────────────────
  it('detecta beforeHash corrompido e retorna valid=false', async () => {
    const service = await buildAuditService(prisma);

    await service.log({ actorId: TEST_ACTOR_ID, action: 'CREATE', entity: 'Encounter', entityId: TEST_ENTITY_ID });
    await service.log({ actorId: TEST_ACTOR_ID, action: 'UPDATE', entity: 'Encounter', entityId: TEST_ENTITY_ID });

    // Pega o segundo registro (o que tem beforeHash)
    const [, second] = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM audit_log ORDER BY created_at ASC
    `;

    await prisma.$executeRawUnsafe(
      `UPDATE audit_log SET before_hash = '${'0'.repeat(64)}' WHERE id = '${second!.id}'`,
    );

    const result = await service.verifyChain();

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(second!.id);
    expect(result.message).toMatch(/beforeHash mismatch/i);
  });

  // ─────────────────────────────────────────────────────────────────
  // Cenário 5: paginação funciona com mais de 1 registro (smoke test)
  // ─────────────────────────────────────────────────────────────────
  it('verifica corretamente cadeia com 10 registros consecutivos', async () => {
    const service = await buildAuditService(prisma);

    for (let i = 0; i < 10; i++) {
      await service.log({
        actorId: TEST_ACTOR_ID,
        action: `ACTION_${i}`,
        entity: 'Encounter',
        entityId: TEST_ENTITY_ID,
      });
    }

    const result = await service.verifyChain();

    expect(result.valid).toBe(true);
    expect(result.count).toBe(10);
  });
});

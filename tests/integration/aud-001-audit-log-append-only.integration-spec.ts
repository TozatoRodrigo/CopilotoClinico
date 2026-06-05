/**
 * Testes de integração — AUD-001: Imutabilidade append-only do audit_log
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com a migration
 * 20260605000000_aud_001_audit_log_append_only aplicada.
 *
 * Referência: https://app.clickup.com/t/90132565680/86ahx6f5w
 *
 * Estes testes verificam que o trigger `audit_log_no_update_delete` impede
 * mutações diretas no banco — garantindo a trilha de auditoria como prova
 * médico-legal inviolável, independente de qualquer comprometimento da camada
 * de aplicação.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';

const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ENTITY_ID = '00000000-0000-0000-0000-000000000002';

function sampleEntry() {
  return {
    actorId: TEST_ACTOR_ID,
    action: 'TEST_ACTION',
    entity: 'TestEntity',
    entityId: TEST_ENTITY_ID,
    beforeHash: null,
    afterHash: 'a'.repeat(64),
    payload: { test: true },
    ip: '127.0.0.1',
  };
}

describe('AUD-001 — audit_log append-only trigger (integration)', () => {
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

  // ────────────────────────────────────────────────────────────
  // Cenário 1: INSERT funciona normalmente
  // ────────────────────────────────────────────────────────────
  it('permite INSERT de novos registros (operação normal da aplicação)', async () => {
    const entry = await prisma.auditLog.create({
      data: sampleEntry(),
    });

    expect(entry.id).toBeDefined();
    expect(entry.actorId).toBe(TEST_ACTOR_ID);
    expect(entry.action).toBe('TEST_ACTION');
    expect(entry.afterHash).toBe('a'.repeat(64));
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  // ────────────────────────────────────────────────────────────
  // Cenário 2: UPDATE é bloqueado pelo trigger
  // ────────────────────────────────────────────────────────────
  it('bloqueia UPDATE direto no banco (trigger audit_log_no_update_delete)', async () => {
    const entry = await prisma.auditLog.create({
      data: sampleEntry(),
    });

    // Tenta UPDATE via SQL raw para contornar camada da aplicação
    await expect(
      prisma.$executeRaw`
        UPDATE audit_log
        SET action = 'TAMPERED'
        WHERE id = ${entry.id}::uuid
      `,
    ).rejects.toThrow(/append-only/i);

    // Confirmar que o registro não foi alterado
    const unchanged = await prisma.auditLog.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(unchanged.action).toBe('TEST_ACTION');
  });

  // ────────────────────────────────────────────────────────────
  // Cenário 3: DELETE é bloqueado pelo trigger
  // ────────────────────────────────────────────────────────────
  it('bloqueia DELETE direto no banco (trigger audit_log_no_update_delete)', async () => {
    const entry = await prisma.auditLog.create({
      data: sampleEntry(),
    });

    // Tenta DELETE via SQL raw
    await expect(
      prisma.$executeRaw`
        DELETE FROM audit_log WHERE id = ${entry.id}::uuid
      `,
    ).rejects.toThrow(/append-only/i);

    // Confirmar que o registro ainda existe
    const stillExists = await prisma.auditLog.findUnique({
      where: { id: entry.id },
    });
    expect(stillExists).not.toBeNull();
    expect(stillExists?.action).toBe('TEST_ACTION');
  });

  // ────────────────────────────────────────────────────────────
  // Cenário 4: Cadeia de hash permanece íntegra após tentativa de ataque
  // ────────────────────────────────────────────────────────────
  it('mantém cadeia de hash íntegra após tentativas de mutação bloqueadas', async () => {
    const firstEntry = await prisma.auditLog.create({
      data: { ...sampleEntry(), afterHash: 'a'.repeat(64) },
    });

    const secondEntry = await prisma.auditLog.create({
      data: { ...sampleEntry(), beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) },
    });

    // Tentativa de adulteração do segundo registro (UPDATE bloqueado)
    await expect(
      prisma.$executeRaw`
        UPDATE audit_log
        SET after_hash = ${'c'.repeat(64)}
        WHERE id = ${secondEntry.id}::uuid
      `,
    ).rejects.toThrow(/append-only/i);

    // Cadeia deve permanecer íntegra
    const [first, second] = await Promise.all([
      prisma.auditLog.findUniqueOrThrow({ where: { id: firstEntry.id } }),
      prisma.auditLog.findUniqueOrThrow({ where: { id: secondEntry.id } }),
    ]);

    expect(first.afterHash).toBe('a'.repeat(64));
    expect(second.beforeHash).toBe('a'.repeat(64));
    expect(second.afterHash).toBe('b'.repeat(64));
  });

  // ────────────────────────────────────────────────────────────
  // Cenário 5: Trigger existe no banco (smoke test de infra)
  // ────────────────────────────────────────────────────────────
  it('confirma que o trigger audit_log_no_update_delete está instalado no banco', async () => {
    const result = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger
      WHERE tgname = 'audit_log_no_update_delete'
    `;

    expect(result).toHaveLength(1);
    expect(result[0]?.tgname).toBe('audit_log_no_update_delete');
  });
});

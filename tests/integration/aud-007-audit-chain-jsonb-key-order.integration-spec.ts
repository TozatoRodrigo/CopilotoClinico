/**
 * Testes de integração — AUD-007: cadeia de auditoria sobre jsonb real (ADR-015)
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 *
 * O jsonb reordena as chaves do payload (chave curta primeiro) e o Prisma
 * reescreve parte dos números não inteiros ao gravar Json. O hash legado era
 * JSON.stringify na ordem de inserção, então o verificador falhava já no
 * primeiro registro com payload de 2+ chaves (alarme de produção desde
 * 12/10/2026). Os testes de unidade usam Prisma mockado e não pegavam isso.
 *
 * Cobre: escrita canônica (versão 2), registros legados gravados como o código
 * antigo gravava, adulteração e rebaixamento de versão, "legado não
 * verificável" e paginação.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';

const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ENTITY_ID = '00000000-0000-0000-0000-000000000002';
const LEGACY_EPOCH = Date.parse('2026-10-01T00:00:00.000Z');

/** Payload real de DOCUMENT_CONFIRMED (documents.service.ts), fora da ordem do jsonb. */
const DOCUMENT_CONFIRMED_PAYLOAD = {
  encounterId: '11111111-1111-1111-1111-111111111111',
  confirmedAt: '2026-10-11T22:14:03.512Z',
  authorPhysicianId: '22222222-2222-2222-2222-222222222222',
  uncertain: false,
  uncertaintyReason: null,
};

/** Números que o Prisma 6.19 grava alterados (1 ULP) — medidos no banco real. */
const PRISMA_REWRITTEN_NUMBERS = [0.1 + 0.2, 1.0000000000000002, 123456789.12345678];

async function buildAuditService(prisma: PrismaClient) {
  const { AuditService } = await import('../../src/modules/audit/audit.service');
  return new AuditService(prisma as never);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Grava exatamente como o AuditService gravava antes da ADR-015: hash sobre
 * JSON.stringify na ordem de inserção e payload pelo Prisma.
 */
async function writeLegacyEntry(
  prisma: PrismaClient,
  entry: { action: string; payload?: Record<string, unknown>; offsetMs: number },
) {
  const createdAt = new Date(LEGACY_EPOCH + entry.offsetMs);
  const last = await prisma.auditLog.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { afterHash: true },
  });
  const afterData = {
    actorId: TEST_ACTOR_ID,
    action: entry.action,
    entity: 'Document',
    entityId: TEST_ENTITY_ID,
    payload: entry.payload ?? null,
    timestamp: createdAt.toISOString(),
  };
  const afterHash = sha256(JSON.stringify(afterData));
  const beforeHash = last?.afterHash
    ? sha256(last.afterHash + JSON.stringify(afterData))
    : undefined;

  return prisma.auditLog.create({
    data: {
      actorId: TEST_ACTOR_ID,
      action: entry.action,
      entity: 'Document',
      entityId: TEST_ENTITY_ID,
      beforeHash,
      afterHash,
      payload: entry.payload ? (entry.payload as Prisma.InputJsonValue) : undefined,
      createdAt,
    },
  });
}

async function withAuditLogTriggerDisabled(prisma: PrismaClient, action: () => Promise<unknown>) {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update_delete',
  );
  try {
    await action();
  } finally {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update_delete',
    );
  }
}

async function payloadText(prisma: PrismaClient, id: string): Promise<string> {
  const [row] = await prisma.$queryRaw<Array<{ text: string }>>`
    SELECT payload::text AS text FROM audit_log WHERE id = ${id}::uuid
  `;
  return row!.text;
}

describe('AUD-007 — cadeia de auditoria sobre jsonb real (ADR-015)', () => {
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

  describe('causa', () => {
    it('o jsonb devolve as chaves numa ordem diferente da inserção', async () => {
      const entry = await writeLegacyEntry(prisma, {
        action: 'DOCUMENT_CONFIRMED',
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
        offsetMs: 0,
      });

      const stored = await payloadText(prisma, entry.id);
      expect(Object.keys(JSON.parse(stored) as object)).not.toEqual(
        Object.keys(DOCUMENT_CONFIRMED_PAYLOAD),
      );
    });

    it('o Prisma grava alguns números não inteiros alterados', async () => {
      const entry = await writeLegacyEntry(prisma, {
        action: 'NUMBERS',
        payload: { values: PRISMA_REWRITTEN_NUMBERS },
        offsetMs: 0,
      });

      const stored = JSON.parse(await payloadText(prisma, entry.id)) as { values: number[] };
      expect(stored.values).not.toEqual(PRISMA_REWRITTEN_NUMBERS);
    });
  });

  describe('escrita canônica (hash_version 2)', () => {
    it('verifica payloads com várias chaves, aninhados, Date, undefined e números reescritos', async () => {
      const service = await buildAuditService(prisma);

      await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId: TEST_ENTITY_ID,
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
      });
      await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'DATA_ERASURE',
        entity: 'Physician',
        entityId: TEST_ENTITY_ID,
        payload: {
          reason: 'user_request',
          erased: { recommendationDecisions: 2, copilotFeedback: 1, encounters: 3, consents: 1 },
        },
      });
      await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'AUDIO_UPLOAD',
        entity: 'Encounter',
        entityId: TEST_ENTITY_ID,
        payload: {
          mimeType: 'audio/webm',
          sizeBytes: 48213,
          retainUntil: new Date('2026-11-11T00:00:00.000Z'),
          notes: undefined,
        },
      });
      await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'COPILOT_ANALYSIS_REFINED',
        entity: 'Encounter',
        entityId: TEST_ENTITY_ID,
        payload: { turnIndex: 2, uncertainty: true, cost: PRISMA_REWRITTEN_NUMBERS[0] },
      });
      await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'AUTH_LOGIN',
        entity: 'Physician',
        entityId: TEST_ENTITY_ID,
      });

      const result = await service.verifyChain();

      expect(result).toEqual({
        valid: true,
        count: 5,
        legacy: { verified: 0, unverifiable: 0, unverifiableSample: [] },
      });
      const versions = await prisma.auditLog.findMany({ select: { hashVersion: true } });
      expect(versions.every((row) => row.hashVersion === 2)).toBe(true);
    });

    it('grava o número exato e devolve o mesmo registro que fica no banco', async () => {
      const service = await buildAuditService(prisma);

      const returned = await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'COPILOT_INTAKE_STARTED',
        entity: 'Encounter',
        entityId: TEST_ENTITY_ID,
        payload: { values: PRISMA_REWRITTEN_NUMBERS, when: new Date('2026-10-12T10:00:00.000Z') },
        ip: '10.0.0.1',
      });

      const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: returned.id } });
      expect(stored).toEqual(returned);
      expect(JSON.parse(await payloadText(prisma, returned.id))).toEqual({
        values: PRISMA_REWRITTEN_NUMBERS,
        when: '2026-10-12T10:00:00.000Z',
      });
    });

    it('grava created_at em UTC mesmo com a sessão do banco em outro fuso', async () => {
      await prisma.$executeRawUnsafe(`ALTER ROLE CURRENT_USER SET timezone = 'America/Sao_Paulo'`);
      const saoPaulo = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      try {
        const service = await buildAuditService(saoPaulo);

        const returned = await service.log({
          actorId: TEST_ACTOR_ID,
          action: 'ENCOUNTER_CREATED',
          entity: 'Encounter',
          entityId: TEST_ENTITY_ID,
          payload: { vertical: 'ps', institutionId: null, identified: false },
        });

        const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: returned.id } });
        expect(stored.createdAt).toEqual(returned.createdAt);
        expect(await service.verifyChain()).toMatchObject({ valid: true, count: 1 });
      } finally {
        await saoPaulo.$disconnect();
        await prisma.$executeRawUnsafe('ALTER ROLE CURRENT_USER RESET timezone');
      }
    });

    it('detecta payload adulterado', async () => {
      const service = await buildAuditService(prisma);
      const entry = await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId: TEST_ENTITY_ID,
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
      });

      await withAuditLogTriggerDisabled(
        prisma,
        () =>
          prisma.$executeRaw`
          UPDATE audit_log SET payload = jsonb_set(payload, '{uncertain}', 'true')
          WHERE id = ${entry.id}::uuid
        `,
      );

      const result = await service.verifyChain();
      expect(result).toMatchObject({ valid: false, count: 1, brokenAt: entry.id });
      expect(result.message).toMatch(/afterHash mismatch/);
    });
  });

  describe('registros legados (hash_version NULL)', () => {
    it('reconstrói a ordem de chaves e os números reescritos e confere a cadeia toda', async () => {
      await writeLegacyEntry(prisma, {
        action: 'DOCUMENT_CONFIRMED',
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
        offsetMs: 0,
      });
      await writeLegacyEntry(prisma, {
        action: 'DATA_ERASURE',
        payload: {
          reason: 'user_request',
          erased: { recommendationDecisions: 2, copilotFeedback: 1, encounters: 3, consents: 1 },
        },
        offsetMs: 1,
      });
      await writeLegacyEntry(prisma, {
        action: 'COPILOT_ANALYSIS_REFINED',
        payload: {
          interactionId: 'i-1',
          turnIndex: 2,
          uncertainty: true,
          cost: PRISMA_REWRITTEN_NUMBERS[0],
        },
        offsetMs: 2,
      });
      await writeLegacyEntry(prisma, {
        action: 'COPILOT_FEEDBACK',
        payload: {
          encounterId: 'e-1',
          kind: 'thumbs_down',
          comment: null,
          model: 'claude-opus-5-5',
          turnIndex: 0,
          retrievedChunkIds: ['c-1', 'c-2'],
          retrievalCoverage: 'partial',
          citedChunkIds: ['c-2'],
        },
        offsetMs: 3,
      });
      // O mesmo formato de novo: a ordem aprendida resolve na primeira tentativa.
      await writeLegacyEntry(prisma, {
        action: 'DOCUMENT_CONFIRMED',
        payload: { ...DOCUMENT_CONFIRMED_PAYLOAD, uncertain: true },
        offsetMs: 4,
      });
      await writeLegacyEntry(prisma, { action: 'AUTH_LOGIN', offsetMs: 5 });

      const service = await buildAuditService(prisma);
      const result = await service.verifyChain();

      expect(result).toEqual({
        valid: true,
        count: 6,
        legacy: { verified: 6, unverifiable: 0, unverifiableSample: [] },
      });
    });

    it('confere o elo da transição legado → canônico', async () => {
      await writeLegacyEntry(prisma, {
        action: 'DOCUMENT_CONFIRMED',
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
        offsetMs: 0,
      });
      const service = await buildAuditService(prisma);
      await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId: TEST_ENTITY_ID,
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
      });

      expect(await service.verifyChain()).toMatchObject({
        valid: true,
        count: 2,
        legacy: { verified: 1, unverifiable: 0 },
      });
    });

    it('detecta adulteração do conteúdo de um registro legado', async () => {
      const first = await writeLegacyEntry(prisma, {
        action: 'DOCUMENT_CONFIRMED',
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
        offsetMs: 0,
      });
      await writeLegacyEntry(prisma, { action: 'AUTH_LOGIN', offsetMs: 1 });

      await withAuditLogTriggerDisabled(
        prisma,
        () =>
          prisma.$executeRaw`
          UPDATE audit_log SET payload = jsonb_set(payload, '{uncertain}', 'true')
          WHERE id = ${first.id}::uuid
        `,
      );

      const service = await buildAuditService(prisma);
      const result = await service.verifyChain();

      expect(result).toMatchObject({ valid: false, count: 1, brokenAt: first.id });
      expect(result.message).toMatch(/afterHash mismatch .*legacy/);
    });

    it('acusa registro legado depois do início da cadeia canônica (versão rebaixada)', async () => {
      const service = await buildAuditService(prisma);
      await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'ENCOUNTER_CREATED',
        entity: 'Encounter',
        entityId: TEST_ENTITY_ID,
        payload: { vertical: 'ps', institutionId: null, identified: false },
      });
      const second = await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId: TEST_ENTITY_ID,
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
      });

      await withAuditLogTriggerDisabled(
        prisma,
        () =>
          prisma.$executeRaw`UPDATE audit_log SET hash_version = NULL WHERE id = ${second.id}::uuid`,
      );

      const result = await service.verifyChain();
      expect(result).toMatchObject({ valid: false, count: 2, brokenAt: second.id });
      expect(result.message).toMatch(/legacy hash after the canonical chain started/);
    });

    it('acusa o primeiro registro canônico rebaixado a legado', async () => {
      const service = await buildAuditService(prisma);
      const first = await service.log({
        actorId: TEST_ACTOR_ID,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId: TEST_ENTITY_ID,
        payload: DOCUMENT_CONFIRMED_PAYLOAD,
      });

      await withAuditLogTriggerDisabled(
        prisma,
        () =>
          prisma.$executeRaw`UPDATE audit_log SET hash_version = NULL WHERE id = ${first.id}::uuid`,
      );

      const result = await service.verifyChain();
      expect(result).toMatchObject({ valid: false, count: 1, brokenAt: first.id });
    });

    it('marca "legado não verificável" sem alarmar e ainda confere o elo com o próximo', async () => {
      // 9 chaves = 9! ordens, acima do teto de busca.
      const nineKeys = Object.fromEntries(
        ['i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'].map((key, index) => [key, index]),
      );
      const unverifiable = await writeLegacyEntry(prisma, {
        action: 'NINE_KEYS',
        payload: nineKeys,
        offsetMs: 0,
      });
      const next = await writeLegacyEntry(prisma, { action: 'AUTH_LOGIN', offsetMs: 1 });

      const service = await buildAuditService(prisma);
      expect(await service.verifyChain()).toEqual({
        valid: true,
        count: 2,
        legacy: {
          verified: 1,
          unverifiable: 1,
          unverifiableSample: [{ id: unverifiable.id, reason: 'key-order-search-limit' }],
        },
      });

      // O afterHash do não verificável continua preso ao beforeHash do próximo.
      await withAuditLogTriggerDisabled(
        prisma,
        () =>
          prisma.$executeRaw`
          UPDATE audit_log SET after_hash = ${'f'.repeat(64)} WHERE id = ${unverifiable.id}::uuid
        `,
      );

      const result = await service.verifyChain();
      expect(result).toMatchObject({ valid: false, count: 2, brokenAt: next.id });
      expect(result.message).toMatch(/beforeHash mismatch/);
    });
  });

  it('pagina a verificação além de uma página (1000 registros)', async () => {
    const total = 1001;
    let previousAfterHash: string | null = null;
    const rows: Prisma.AuditLogCreateManyInput[] = [];
    for (let index = 0; index < total; index++) {
      const createdAt = new Date(LEGACY_EPOCH + index);
      const payload = { index, kind: index % 2 === 0 ? 'even' : 'odd' };
      const afterData = {
        actorId: TEST_ACTOR_ID,
        action: 'BULK',
        entity: 'Document',
        entityId: TEST_ENTITY_ID,
        payload,
        timestamp: createdAt.toISOString(),
      };
      const afterHash = sha256(JSON.stringify(afterData));
      rows.push({
        actorId: TEST_ACTOR_ID,
        action: 'BULK',
        entity: 'Document',
        entityId: TEST_ENTITY_ID,
        afterHash,
        beforeHash: previousAfterHash
          ? sha256(previousAfterHash + JSON.stringify(afterData))
          : null,
        payload,
        createdAt,
      });
      previousAfterHash = afterHash;
    }
    await prisma.auditLog.createMany({ data: rows });

    const service = await buildAuditService(prisma);
    expect(await service.verifyChain()).toMatchObject({
      valid: true,
      count: total,
      legacy: { verified: total, unverifiable: 0 },
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { AuditService } from './audit.service';
import { PrismaService } from '../../config/prisma.service';
import { canonicalEventText, canonicalJson, chainHashes } from './audit-hash';
import type { JsonValue } from './audit-hash';

const actorId = '550e8400-e29b-41d4-a716-446655440000';
const entityId = '770e8400-e29b-41d4-a716-446655440002';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    actorId,
    action: 'create',
    entity: 'encounter',
    entityId,
    beforeHash: null as string | null,
    afterHash: 'hash-1',
    hashVersion: 2,
    payload: null,
    ip: null,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/** Payload de DOCUMENT_CONFIRMED em ordem de inserção e como o jsonb o devolve. */
const insertionOrderPayload = { encounterId: 'e', confirmedAt: 'c', uncertain: false };
const jsonbPayloadText = '{"uncertain": false, "confirmedAt": "c", "encounterId": "e"}';

interface ChainRowFixture {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  payloadText: string | null;
  createdAt: Date;
  afterHash: string | null;
  beforeHash: string | null;
  hashVersion: number | null;
}

/** Cadeia canônica como o AuditService grava, lida como o banco devolve. */
function canonicalChain(
  entries: Array<{ action: string; payload: JsonValue; payloadText?: string }>,
): ChainRowFixture[] {
  let previousAfterHash: string | null = null;
  return entries.map((entry, index) => {
    const createdAt = new Date(Date.UTC(2026, 9, 12, 0, 0, 0, index));
    const text = canonicalEventText({
      actorId,
      action: entry.action,
      entity: 'encounter',
      entityId,
      payload: entry.payload,
      timestamp: createdAt.toISOString(),
    });
    const { afterHash, beforeHash } = chainHashes(text, previousAfterHash);
    previousAfterHash = afterHash;
    return {
      id: `audit-${index + 1}`,
      actorId,
      action: entry.action,
      entity: 'encounter',
      entityId,
      payloadText:
        entry.payloadText ?? (entry.payload === null ? null : JSON.stringify(entry.payload)),
      createdAt,
      afterHash,
      beforeHash,
      hashVersion: 2,
    };
  });
}

/** Registro legado: hash sobre JSON.stringify na ordem de inserção. */
function legacyRow(
  id: string,
  payload: Record<string, unknown> | null,
  payloadText: string | null,
  createdAt: Date,
): ChainRowFixture {
  const text = JSON.stringify({
    actorId,
    action: 'DOCUMENT_CONFIRMED',
    entity: 'encounter',
    entityId,
    payload,
    timestamp: createdAt.toISOString(),
  });
  return {
    id,
    actorId,
    action: 'DOCUMENT_CONFIRMED',
    entity: 'encounter',
    entityId,
    payloadText,
    createdAt,
    afterHash: sha256(text),
    beforeHash: null,
    hashVersion: null,
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
    auditLog: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
      auditLog: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    service = new AuditService(prisma as unknown as PrismaService);
  });

  /** Valores interpolados no INSERT (segunda chamada de $executeRaw, depois do lock). */
  function insertCall(): { sql: string; values: unknown[] } {
    const [strings, ...values] = prisma.$executeRaw.mock.calls[1] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    return { sql: strings.join('?'), values };
  }

  // ─────────────────────────────────────────────────
  // log()
  // ─────────────────────────────────────────────────
  describe('log', () => {
    const fixedDate = new Date('2026-10-12T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('grava o primeiro registro com hash canônico versão 2 e sem beforeHash', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const result = await service.log({
        actorId,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId,
        payload: insertionOrderPayload,
        ip: '192.168.1.1',
      });

      const expectedText = canonicalEventText({
        actorId,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId,
        payload: insertionOrderPayload,
        timestamp: fixedDate.toISOString(),
      });
      expect(result).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        actorId,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId,
        beforeHash: null,
        afterHash: sha256(expectedText),
        hashVersion: 2,
        payload: insertionOrderPayload,
        ip: '192.168.1.1',
        createdAt: fixedDate,
      });
    });

    it('o hash não depende da ordem das chaves do payload', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const first = await service.log({
        actorId,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId,
        payload: insertionOrderPayload,
      });
      const second = await service.log({
        actorId,
        action: 'DOCUMENT_CONFIRMED',
        entity: 'Document',
        entityId,
        payload: JSON.parse(jsonbPayloadText) as Record<string, unknown>,
      });

      expect(second.afterHash).toBe(first.afterHash);
    });

    it('encadeia com o afterHash do registro anterior', async () => {
      const previousAfterHash = 'a'.repeat(64);
      prisma.auditLog.findFirst.mockResolvedValue({
        afterHash: previousAfterHash,
        createdAt: new Date('2026-10-12T11:00:00.000Z'),
      });

      const result = await service.log({
        actorId,
        action: 'update',
        entity: 'encounter',
        entityId,
      });

      const expectedText = canonicalEventText({
        actorId,
        action: 'update',
        entity: 'encounter',
        entityId,
        payload: null,
        timestamp: fixedDate.toISOString(),
      });
      expect(result.beforeHash).toBe(sha256(previousAfterHash + expectedText));
    });

    it('grava o payload como o texto canônico via SQL, com a versão e a data em UTC', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const result = await service.log({
        actorId,
        action: 'COPILOT_ANALYSIS_REFINED',
        entity: 'encounter',
        entityId,
        payload: { turnIndex: 2, cost: 0.1 + 0.2, when: fixedDate, notes: undefined },
      });

      const { sql, values } = insertCall();
      expect(sql).toMatch(/INSERT INTO audit_log/);
      expect(sql).toMatch(/::jsonb/);
      expect(sql).toMatch(/AT TIME ZONE 'UTC'/);
      expect(values).toContain(
        '{"cost":0.30000000000000004,"turnIndex":2,"when":"2026-10-12T12:00:00.000Z"}',
      );
      expect(values).toContain(2);
      expect(values).toContain(fixedDate.toISOString());
      expect(values).toContain(result.afterHash);
      expect(result.payload).toEqual({
        turnIndex: 2,
        cost: 0.1 + 0.2,
        when: fixedDate.toISOString(),
      });
    });

    it('grava NULL quando o evento não tem payload', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const result = await service.log({
        actorId,
        action: 'AUTH_LOGIN',
        entity: 'physician',
        entityId,
      });

      expect(result.payload).toBeNull();
      expect(result.ip).toBeNull();
      expect(insertCall().values.filter((value) => value === null)).toHaveLength(3);
    });

    it('avança 1 ms quando o relógio não passou do último registro', async () => {
      prisma.auditLog.findFirst.mockResolvedValue({
        afterHash: 'a'.repeat(64),
        createdAt: fixedDate,
      });

      const result = await service.log({
        actorId,
        action: 'create',
        entity: 'encounter',
        entityId,
      });

      expect(result.createdAt).toEqual(new Date(fixedDate.getTime() + 1));
    });

    it('serializes chain writes inside a transaction with an advisory lock', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);

      await service.log({ actorId, action: 'create', entity: 'encounter', entityId });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.auditLog.findFirst.mock.invocationCallOrder[0]!,
      );
      expect(prisma.auditLog.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$executeRaw.mock.invocationCallOrder[1]!,
      );
    });

    it('retries serializable transaction conflicts before failing the audit write', async () => {
      prisma.$transaction
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
          callback(prisma),
        );
      prisma.auditLog.findFirst.mockResolvedValue(null);

      await service.log({ actorId, action: 'create', entity: 'encounter', entityId });

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────
  // logInTransaction()
  // ─────────────────────────────────────────────────
  describe('logInTransaction', () => {
    it("writes the chained entry with the caller's transaction instead of opening one", async () => {
      const previousAfterHash = 'b'.repeat(64);
      // Sem `create`: o escritor dentro da transação do chamador tem de ser o
      // canônico (INSERT com ::jsonb e hash_version 2, ADR-015). Um
      // auditLog.create gravaria linha legada depois das canônicas, o que o
      // verificador acusa como falha de integridade.
      const tx = {
        $executeRaw: vi.fn(),
        auditLog: {
          findFirst: vi.fn().mockResolvedValue({
            afterHash: previousAfterHash,
            createdAt: new Date('2020-01-01'),
          }),
        },
      };
      const payload = { physicianId: actorId, encounterId: entityId };

      const entry = await service.logInTransaction(tx as never, {
        actorId: 'system',
        action: 'AUDIO_RETENTION_PURGE',
        entity: 'AudioCapture',
        entityId,
        payload,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.auditLog.findFirst.mock.invocationCallOrder[0]!,
      );

      const [strings, ...values] = tx.$executeRaw.mock.calls[1] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(strings.join('?')).toMatch(/INSERT INTO audit_log/);
      expect(values).toContain(canonicalJson(payload));
      expect(entry.hashVersion).toBe(2);
      expect(entry.beforeHash).toBe(
        chainHashes(
          canonicalEventText({
            actorId: 'system',
            action: 'AUDIO_RETENTION_PURGE',
            entity: 'AudioCapture',
            entityId,
            payload,
            timestamp: entry.createdAt.toISOString(),
          }),
          previousAfterHash,
        ).beforeHash,
      );
    });
  });

  // ─────────────────────────────────────────────────
  // query()
  // ─────────────────────────────────────────────────
  describe('query', () => {
    it('returns paginated results with total count', async () => {
      const items = [makeEntry()];
      prisma.auditLog.findMany.mockResolvedValue(items);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.query({
        limit: 50,
        offset: 0,
      });

      expect(result).toEqual({ items, total: 1 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('filters by entity and entityId', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.query({
        entity: 'encounter',
        entityId,
        limit: 50,
        offset: 0,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity: 'encounter',
            entityId,
          }),
        }),
      );
    });

    it('filters by actorId', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.query({
        actorId,
        limit: 50,
        offset: 0,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ actorId }),
        }),
      );
    });

    it('filters by date range', async () => {
      const from = new Date('2025-01-01');
      const to = new Date('2025-12-31');
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.query({
        from,
        to,
        limit: 50,
        offset: 0,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('respects limit and offset for pagination', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(100);

      await service.query({
        limit: 10,
        offset: 20,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });

  // ─────────────────────────────────────────────────
  // toCsv()
  // ─────────────────────────────────────────────────
  describe('toCsv', () => {
    it('exporta a versão do hash ao lado dos hashes', () => {
      const csv = service.toCsv([
        makeEntry({ afterHash: 'b'.repeat(64), hashVersion: 2 }),
        makeEntry({ afterHash: 'c'.repeat(64), hashVersion: null }),
      ] as never);

      const [header, canonical, legacy] = csv.split('\n');
      expect(header).toBe(
        'createdAt,actorId,action,entity,entityId,ip,beforeHash,afterHash,hashVersion,payload',
      );
      expect(canonical).toContain(`${'b'.repeat(64)},2,`);
      expect(legacy).toContain(`${'c'.repeat(64)},,`);
    });
  });

  // ─────────────────────────────────────────────────
  // verifyChain()
  // ─────────────────────────────────────────────────
  describe('verifyChain', () => {
    const noLegacy = { verified: 0, unverifiable: 0, unverifiableSample: [] };

    it('returns valid=true and count=0 for empty audit log', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      expect(await service.verifyChain()).toEqual({ valid: true, count: 0, legacy: noLegacy });
    });

    it('confere cadeia canônica lida com as chaves na ordem do jsonb', async () => {
      prisma.$queryRaw.mockResolvedValueOnce(
        canonicalChain([
          {
            action: 'DOCUMENT_CONFIRMED',
            payload: insertionOrderPayload,
            payloadText: jsonbPayloadText,
          },
          { action: 'AUTH_LOGIN', payload: null },
        ]),
      );

      expect(await service.verifyChain()).toEqual({ valid: true, count: 2, legacy: noLegacy });
    });

    it('returns valid=false with brokenAt when afterHash is corrupted', async () => {
      const [entry] = canonicalChain([{ action: 'create', payload: null }]);
      prisma.$queryRaw.mockResolvedValueOnce([{ ...entry, afterHash: 'tampered'.padEnd(64, '0') }]);

      const result = await service.verifyChain();

      expect(result).toMatchObject({ valid: false, count: 1, brokenAt: 'audit-1' });
      expect(result.message).toMatch(/afterHash mismatch/);
    });

    it('returns valid=false with brokenAt when beforeHash chain link is severed', async () => {
      const [first, second] = canonicalChain([
        { action: 'create', payload: null },
        { action: 'update', payload: null },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        first,
        { ...second, beforeHash: 'wrong'.padEnd(64, '0') },
      ]);

      const result = await service.verifyChain();

      expect(result).toMatchObject({ valid: false, brokenAt: 'audit-2' });
      expect(result.message).toMatch(/beforeHash mismatch/);
    });

    it('confere registro legado reconstruindo a ordem de inserção das chaves', async () => {
      const createdAt = new Date('2026-10-11T00:00:00.000Z');
      prisma.$queryRaw.mockResolvedValueOnce([
        legacyRow('legacy-1', insertionOrderPayload, jsonbPayloadText, createdAt),
      ]);

      expect(await service.verifyChain()).toEqual({
        valid: true,
        count: 1,
        legacy: { verified: 1, unverifiable: 0, unverifiableSample: [] },
      });
    });

    it('acusa registro legado com conteúdo alterado', async () => {
      const createdAt = new Date('2026-10-11T00:00:00.000Z');
      const tampered = jsonbPayloadText.replace('false', 'true');
      prisma.$queryRaw.mockResolvedValueOnce([
        legacyRow('legacy-1', insertionOrderPayload, tampered, createdAt),
      ]);

      const result = await service.verifyChain();

      expect(result).toMatchObject({ valid: false, count: 1, brokenAt: 'legacy-1' });
      expect(result.message).toMatch(/afterHash mismatch at record legacy-1 \(legacy hash\)/);
    });

    it('acusa registro legado depois do primeiro canônico', async () => {
      const [canonical] = canonicalChain([{ action: 'create', payload: null }]);
      const legacy = legacyRow('legacy-2', null, null, new Date('2026-10-13T00:00:00.000Z'));
      prisma.$queryRaw.mockResolvedValueOnce([canonical, legacy]);

      const result = await service.verifyChain();

      expect(result).toMatchObject({ valid: false, count: 2, brokenAt: 'legacy-2' });
      expect(result.message).toMatch(/legacy hash after the canonical chain started/);
    });

    it('acusa versão de hash desconhecida', async () => {
      const [entry] = canonicalChain([{ action: 'create', payload: null }]);
      prisma.$queryRaw.mockResolvedValueOnce([{ ...entry, hashVersion: 3 }]);

      const result = await service.verifyChain();

      expect(result).toMatchObject({ valid: false, brokenAt: 'audit-1' });
      expect(result.message).toMatch(/unknown hash_version 3/);
    });

    it('conta "legado não verificável" sem romper a cadeia e lista no máximo 20 ids', async () => {
      // Número gravado 10 ULPs ao lado do hasheado: fora do raio de busca.
      const rows = Array.from({ length: 21 }, (_, index) => {
        const createdAt = new Date(Date.UTC(2026, 9, 11, 0, 0, 0, index));
        const row = legacyRow(
          `legacy-${index}`,
          { cost: 0.004236 },
          '{"cost": 0.004236000000000009}',
          createdAt,
        );
        return row;
      });
      prisma.$queryRaw.mockResolvedValueOnce(rows);

      const result = await service.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.legacy.unverifiable).toBe(21);
      expect(result.legacy.unverifiableSample).toHaveLength(20);
      expect(result.legacy.unverifiableSample[0]).toEqual({
        id: 'legacy-0',
        reason: 'rewritten-number',
      });
    });

    it('pagina pelo último id quando a página vem cheia', async () => {
      const rows = canonicalChain(
        Array.from({ length: 1001 }, (_, index) => ({ action: `ACTION_${index}`, payload: null })),
      );
      prisma.$queryRaw
        .mockResolvedValueOnce(rows.slice(0, 1000))
        .mockResolvedValueOnce(rows.slice(1000));

      const result = await service.verifyChain();

      expect(result).toEqual({ valid: true, count: 1001, legacy: noLegacy });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(prisma.$queryRaw.mock.calls[1])).toContain('audit-1000');
    });
  });
});

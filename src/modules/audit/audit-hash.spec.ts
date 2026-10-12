import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  CANONICAL_AUDIT_HASH_VERSION,
  LegacyKeyOrderHints,
  canonicalEventText,
  canonicalJson,
  chainHashes,
  matchLegacyEvent,
  toJsonValue,
} from './audit-hash';
import type { AuditEventFields, JsonValue } from './audit-hash';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** O que o jsonb devolve: chaves mais curtas primeiro, depois por byte. */
function jsonbOrder(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(jsonbOrder);
  const keys = Object.keys(value).sort(
    (a, b) =>
      Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)),
  );
  return Object.fromEntries(keys.map((key) => [key, jsonbOrder(value[key] ?? null)]));
}

function shiftUlps(value: number, steps: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigInt64(0, view.getBigInt64(0) + BigInt(steps));
  return view.getFloat64(0);
}

const baseEvent = {
  actorId: '550e8400-e29b-41d4-a716-446655440000',
  action: 'DOCUMENT_CONFIRMED',
  entity: 'Document',
  entityId: '770e8400-e29b-41d4-a716-446655440002',
  timestamp: '2026-10-11T22:14:03.512Z',
};

/** Texto que o AuditService hasheava antes da ADR-015 — esta ordem de chaves. */
function legacyEventText(payload: Record<string, unknown> | null): string {
  const { actorId, action, entity, entityId, timestamp } = baseEvent;
  return JSON.stringify({ actorId, action, entity, entityId, payload, timestamp });
}

function legacyAfterHash(payload: Record<string, unknown> | null): string {
  return sha256(legacyEventText(payload));
}

/** O evento como o verificador o lê do banco. */
function storedEvent(payload: JsonValue): AuditEventFields {
  return { ...baseEvent, payload: jsonbOrder(payload) };
}

const documentConfirmed = {
  encounterId: '11111111-1111-1111-1111-111111111111',
  confirmedAt: '2026-10-11T22:14:03.512Z',
  authorPhysicianId: '22222222-2222-2222-2222-222222222222',
  uncertain: false,
  uncertaintyReason: null,
};

describe('canonicalJson', () => {
  it('ordena as chaves em todos os níveis e preserva a ordem dos arrays', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 1 }, 3], c: { z: null, y: true } })).toBe(
      '{"a":[{"c":1,"d":2},3],"b":1,"c":{"y":true,"z":null}}',
    );
  });

  it('independe da ordem de inserção', () => {
    expect(canonicalJson(documentConfirmed)).toBe(canonicalJson(jsonbOrder(documentConfirmed)));
  });

  it('ordena por unidade UTF-16, como o RFC 8785', () => {
    // Por code point viria "｡" (U+FF61) antes de "😀" (U+1F600); em UTF-16, 0xD83D < 0xFF61.
    expect(canonicalJson({ '｡': 1, '😀': 2, a: 3 })).toBe('{"a":3,"😀":2,"｡":1}');
  });

  it('serializa números e strings como o JSON.stringify', () => {
    expect(canonicalJson([1e21, 0.1 + 0.2, -0, 1e-7, 'aspas " e \n'])).toBe(
      '[1e+21,0.30000000000000004,0,1e-7,"aspas \\" e \\n"]',
    );
  });
});

describe('toJsonValue', () => {
  it('normaliza como o JSON: Date vira ISO, undefined some, NaN vira null', () => {
    expect(
      toJsonValue({ when: new Date('2026-10-12T10:00:00.000Z'), notes: undefined, ratio: NaN }),
    ).toEqual({ when: '2026-10-12T10:00:00.000Z', ratio: null });
  });
});

describe('canonicalEventText / chainHashes', () => {
  it('põe a versão dentro do texto hasheado', () => {
    const text = canonicalEventText({ ...baseEvent, payload: documentConfirmed });

    expect(JSON.parse(text)).toMatchObject({ hashVersion: CANONICAL_AUDIT_HASH_VERSION });
    expect(text).toBe(canonicalEventText({ ...baseEvent, payload: jsonbOrder(documentConfirmed) }));
  });

  it('encadeia com o afterHash anterior e não encadeia o primeiro registro', () => {
    const text = canonicalEventText({ ...baseEvent, payload: null });

    expect(chainHashes(text, null)).toEqual({ afterHash: sha256(text), beforeHash: null });
    expect(chainHashes(text, 'a'.repeat(64)).beforeHash).toBe(sha256('a'.repeat(64) + text));
  });
});

describe('matchLegacyEvent', () => {
  it('reconstrói o texto original a partir da ordem do jsonb', () => {
    const afterHash = legacyAfterHash(documentConfirmed);

    const match = matchLegacyEvent(
      storedEvent(documentConfirmed),
      afterHash,
      new LegacyKeyOrderHints(),
    );

    expect(match).toEqual({ kind: 'matched', eventText: legacyEventText(documentConfirmed) });
  });

  it('reconstrói objetos aninhados', () => {
    const payload = {
      reason: 'user_request',
      erased: { recommendationDecisions: 2, copilotFeedback: 1, encounters: 3, consents: 1 },
    };

    expect(
      matchLegacyEvent(storedEvent(payload), legacyAfterHash(payload), new LegacyKeyOrderHints()),
    ).toMatchObject({ kind: 'matched' });
  });

  it('reconstrói arrays mantendo a ordem dos itens e reordenando objetos dentro deles', () => {
    const payload = {
      retrievedChunkIds: ['c-2', 'c-1'],
      citations: [{ source: 'MS', chunkId: 'c-2' }],
      turnIndex: 0,
    };

    expect(
      matchLegacyEvent(storedEvent(payload), legacyAfterHash(payload), new LegacyKeyOrderHints()),
    ).toMatchObject({ kind: 'matched' });
  });

  it('confere evento sem payload', () => {
    expect(
      matchLegacyEvent(storedEvent(null), legacyAfterHash(null), new LegacyKeyOrderHints()),
    ).toMatchObject({ kind: 'matched' });
  });

  it('recupera número que o Prisma gravou alguns ULPs ao lado', () => {
    const original = { interactionId: 'i-1', turnIndex: 2, cost: 0.1 + 0.2 };
    const stored = { ...original, cost: shiftUlps(original.cost, -1) };

    expect(stored.cost).toBe(0.3);
    expect(
      matchLegacyEvent(storedEvent(stored), legacyAfterHash(original), new LegacyKeyOrderHints()),
    ).toMatchObject({ kind: 'matched' });
  });

  it('acusa conteúdo alterado quando a busca é completa', () => {
    const tampered = { ...documentConfirmed, uncertain: true };

    expect(
      matchLegacyEvent(
        storedEvent(tampered),
        legacyAfterHash(documentConfirmed),
        new LegacyKeyOrderHints(),
      ),
    ).toEqual({ kind: 'mismatch' });
  });

  it('acusa campo de fora do payload alterado', () => {
    const event = { ...storedEvent(documentConfirmed), actorId: 'outro-medico' };

    expect(
      matchLegacyEvent(event, legacyAfterHash(documentConfirmed), new LegacyKeyOrderHints()),
    ).toEqual({ kind: 'mismatch' });
  });

  it('não conclui quando um número não inteiro não bate dentro do raio de ULPs', () => {
    const original = { turnIndex: 2, cost: 0.004236 };
    const stored = { ...original, cost: shiftUlps(original.cost, 10) };

    expect(
      matchLegacyEvent(storedEvent(stored), legacyAfterHash(original), new LegacyKeyOrderHints()),
    ).toEqual({ kind: 'unverifiable', reason: 'rewritten-number' });
  });

  it('não conclui quando as ordens possíveis passam do teto de busca', () => {
    // 9 chaves = 9! ordens; a original (inversa) fica fora das primeiras 8!.
    const nineKeys = Object.fromEntries(
      ['i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'].map((key, index) => [key, index]),
    );

    expect(
      matchLegacyEvent(storedEvent(nineKeys), legacyAfterHash(nineKeys), new LegacyKeyOrderHints()),
    ).toEqual({ kind: 'unverifiable', reason: 'key-order-search-limit' });
  });

  it('não confere afterHash ausente', () => {
    expect(
      matchLegacyEvent(storedEvent(documentConfirmed), null, new LegacyKeyOrderHints()),
    ).toEqual({ kind: 'mismatch' });
  });

  it('aprende a ordem que bateu e a tenta primeiro no próximo registro', () => {
    const hints = new LegacyKeyOrderHints();
    const stored = jsonbOrder(documentConfirmed) as Record<string, JsonValue>;

    matchLegacyEvent(storedEvent(documentConfirmed), legacyAfterHash(documentConfirmed), hints);

    expect(hints.preferredOrder(Object.keys(stored))).toEqual(Object.keys(documentConfirmed));
  });
});

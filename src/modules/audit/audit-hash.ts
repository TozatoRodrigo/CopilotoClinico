import { createHash } from 'crypto';

/**
 * Hash da trilha de auditoria (ADR-015).
 *
 * Versão 1 — legado, `hash_version` NULL: `JSON.stringify` do evento com o
 * payload na ordem de inserção das chaves. O jsonb reordena as chaves e o
 * Prisma reescreve parte dos números não inteiros ao gravar, então esse texto
 * não volta do banco. O verificador o reconstrói testando as ordens de chave
 * e os doubles vizinhos de cada número (`matchLegacyEvent`).
 *
 * Versão 2 — `hash_version` = 2: JSON canônico (chaves ordenadas em todos os
 * níveis, como no RFC 8785/JCS), com a versão dentro do texto hasheado. O
 * payload é gravado como esse mesmo texto (`::jsonb`), sem passar pela
 * serialização do Prisma, e o texto se refaz byte a byte a partir do banco.
 */

export const CANONICAL_AUDIT_HASH_VERSION = 2;

/**
 * Teto de candidatos testados por registro legado. 8! cobre o maior payload
 * gravado até hoje (8 chaves no primeiro nível, sem aninhamento) com folga
 * para os vizinhos de um número; acima disso o registro vira "legado não
 * verificável" em vez de travar a verificação.
 */
export const LEGACY_CANDIDATE_LIMIT = 40_320;

/**
 * Raio, em ULPs, dos doubles testados em volta de cada número que não é
 * inteiro seguro. Medido em 80 mil números: o Prisma 6.19 altera 15–40% dos
 * não inteiros ao gravar Json, em no máximo 4 ULPs.
 */
const LEGACY_NUMBER_ULP_RADIUS = 4;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Os campos do evento que entram no hash, nas duas versões. */
export interface AuditEventFields {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  /** `null` quando o evento não tem payload (coluna NULL). */
  payload: JsonValue;
  /** `createdAt.toISOString()`. */
  timestamp: string;
}

export interface ChainHashes {
  afterHash: string;
  /** `null` no primeiro registro da cadeia. */
  beforeHash: string | null;
}

export type LegacyUnverifiableReason = 'key-order-search-limit' | 'rewritten-number';

export type LegacyMatch =
  | { kind: 'matched'; eventText: string }
  /** Todos os candidatos testados, nenhum bate: o conteúdo mudou depois do hash. */
  | { kind: 'mismatch' }
  | { kind: 'unverifiable'; reason: LegacyUnverifiableReason };

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Normaliza o payload para o valor JSON que de fato será gravado: `Date` vira
 * ISO, chaves `undefined` somem, `NaN`/`Infinity` viram `null` — o mesmo que
 * `JSON.stringify` faz.
 */
export function toJsonValue(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/**
 * JSON canônico: chaves ordenadas por unidade UTF-16 em todos os níveis, sem
 * espaços; strings e números como no `JSON.stringify`. Para os tipos que o
 * JSON tem, é a serialização do RFC 8785 (JCS) — qualquer implementação de
 * JCS reproduz o hash fora da aplicação.
 */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`);
  return `{${members.join(',')}}`;
}

/** Texto hasheado na versão 2. */
export function canonicalEventText(event: AuditEventFields): string {
  return canonicalJson({ ...event, hashVersion: CANONICAL_AUDIT_HASH_VERSION });
}

/** O mesmo encadeamento nas duas versões; só o texto do evento muda. */
export function chainHashes(eventText: string, previousAfterHash: string | null): ChainHashes {
  return {
    afterHash: sha256Hex(eventText),
    beforeHash: previousAfterHash === null ? null : sha256Hex(previousAfterHash + eventText),
  };
}

/**
 * Procura o texto que o escritor legado hasheou. As chaves de fora tinham
 * ordem fixa no código; só o payload varia: cada objeto com 2+ chaves em
 * todas as ordens, cada número não inteiro com os vizinhos.
 *
 * Esgotar os candidatos sem bater prova que o conteúdo mudou — exceto se há
 * número não inteiro, porque o raio de ULPs é empírico.
 */
export function matchLegacyEvent(
  event: AuditEventFields,
  afterHash: string | null,
  hints: LegacyKeyOrderHints,
): LegacyMatch {
  const { actorId, action, entity, entityId, payload, timestamp } = event;
  const prefix = `${JSON.stringify({ actorId, action, entity, entityId }).slice(0, -1)},"payload":`;
  const suffix = `,"timestamp":${JSON.stringify(timestamp)}}`;

  let tried = 0;
  for (const payloadText of legacyPayloadTexts(payload, hints)) {
    if (tried++ === LEGACY_CANDIDATE_LIMIT) {
      return { kind: 'unverifiable', reason: 'key-order-search-limit' };
    }
    const eventText = prefix + payloadText + suffix;
    if (sha256Hex(eventText) === afterHash) {
      hints.learn(payloadText);
      return { kind: 'matched', eventText };
    }
  }

  return hasInexactNumber(payload)
    ? { kind: 'unverifiable', reason: 'rewritten-number' }
    : { kind: 'mismatch' };
}

/**
 * Lembra a ordem de chaves que bateu em cada conjunto de chaves. Eventos do
 * mesmo ponto do código repetem a ordem, então o registro seguinte acerta na
 * primeira tentativa em vez de percorrer até 8! ordens. Só muda a ordem de
 * busca — nunca o resultado.
 */
export class LegacyKeyOrderHints {
  private readonly orders = new Map<string, string[]>();

  preferredOrder(keys: string[]): string[] {
    return this.orders.get(keySetOf(keys)) ?? keys;
  }

  learn(payloadText: string): void {
    this.remember(JSON.parse(payloadText) as JsonValue);
  }

  private remember(value: JsonValue): void {
    if (value === null || typeof value !== 'object') return;
    const keys = Object.keys(value);
    if (!Array.isArray(value) && keys.length > 1) this.orders.set(keySetOf(keys), keys);
    Object.values(value).forEach((child) => this.remember(child));
  }
}

function keySetOf(keys: string[]): string {
  return JSON.stringify([...keys].sort());
}

function* legacyPayloadTexts(value: JsonValue, hints: LegacyKeyOrderHints): Generator<string> {
  if (typeof value === 'number') {
    for (const candidate of nearbyDoubles(value)) yield JSON.stringify(candidate);
    return;
  }
  if (value === null || typeof value !== 'object') {
    yield JSON.stringify(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const items of product(value.map((item) => () => legacyPayloadTexts(item, hints)))) {
      yield `[${items.join(',')}]`;
    }
    return;
  }
  for (const keys of permutations(hints.preferredOrder(Object.keys(value)))) {
    const members = keys.map((key) => () => legacyPayloadTexts(value[key] ?? null, hints));
    for (const texts of product(members)) {
      yield `{${keys.map((key, i) => `${JSON.stringify(key)}:${texts[i]}`).join(',')}}`;
    }
  }
}

/** Todas as ordens, começando pela recebida. */
function* permutations(items: string[]): Generator<string[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (const [index, head] of items.entries()) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) yield [head, ...tail];
  }
}

function* product(factories: Array<() => Iterable<string>>): Generator<string[]> {
  const [first, ...rest] = factories;
  if (!first) {
    yield [];
    return;
  }
  for (const head of first()) {
    for (const tail of product(rest)) yield [head, ...tail];
  }
}

/** O próprio número primeiro; depois ±1, ±2… ULPs, do mesmo sinal. */
function nearbyDoubles(value: number): number[] {
  if (Number.isSafeInteger(value)) return [value];
  const candidates = [value];
  for (let step = 1; step <= LEGACY_NUMBER_ULP_RADIUS; step++) {
    for (const neighbor of [shiftUlps(value, -step), shiftUlps(value, step)]) {
      if (Number.isFinite(neighbor) && Math.sign(neighbor) === Math.sign(value)) {
        candidates.push(neighbor);
      }
    }
  }
  return candidates;
}

const ulpView = new DataView(new ArrayBuffer(8));

/** Doubles do mesmo sinal são vizinhos quando os bits diferem de 1. */
function shiftUlps(value: number, steps: number): number {
  ulpView.setFloat64(0, value);
  ulpView.setBigInt64(0, ulpView.getBigInt64(0) + BigInt(steps));
  return ulpView.getFloat64(0);
}

function hasInexactNumber(value: JsonValue): boolean {
  if (typeof value === 'number') return !Number.isSafeInteger(value);
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some(hasInexactNumber);
}

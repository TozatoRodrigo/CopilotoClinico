import { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag } from '../feature-flag';
import {
  SealedValueError,
  canOpen,
  isSealedText,
  loadFieldKeyring,
  openJson,
  openText,
  sealJson,
  sealText,
  type FieldKeyring,
} from '../../shared/crypto/field-cipher';
import {
  RELATIONS,
  SEALED_COLUMNS,
  sealedFieldsOf,
  type SealedColumn,
} from './clinical-text-fields';

/**
 * CC-207 / ADR-020 — texto clínico cifrado em repouso, transparente para os
 * serviços.
 *
 * - Leitura dupla, sempre: valor `enc:v1:` é decifrado ao sair do Prisma —
 *   inclusive em `include`/`select` aninhados —, texto em claro volta como
 *   está. Só os campos selecionados passam pela cifra: listagem que não pede
 *   o texto não decifra nada.
 * - Gravação cifrada só com `CLINICAL_TEXT_ENCRYPTION=on` (lida a cada
 *   gravação). Desligar volta a gravar em claro sem perder a leitura do que
 *   já foi cifrado — é o rollback.
 * - Filtro, ordenação ou `distinct` por conteúdo de campo cifrado lança
 *   ClinicalTextQueryError: sobre texto cifrado o resultado seria errado em
 *   silêncio. Continuam valendo `null`/`not: null` e a igualdade com um
 *   marcador do sistema gravado em claro (PLAINTEXT_MARKERS).
 *
 * Não passa pela extensão: `$queryRaw`/`$executeRaw` (leia com openText/
 * openJson se um dia ler estas colunas por SQL) e filtros dentro de
 * `include`/`select` aninhados.
 */

export const CLINICAL_TEXT_ENCRYPTION_FLAG = 'CLINICAL_TEXT_ENCRYPTION';

export interface ClinicalTextCipher {
  /** Flag lida a cada gravação. */
  encryptWrites(): boolean;
  /** Chaves carregadas na primeira vez que são precisas (gravar com a flag, ou ler valor cifrado). */
  keyring(): FieldKeyring;
}

export function clinicalTextCipherFrom(config: ConfigService): ClinicalTextCipher {
  let keyring: FieldKeyring | undefined;
  return {
    encryptWrites: () => readBooleanFlag(config, CLINICAL_TEXT_ENCRYPTION_FLAG, false),
    keyring: () => (keyring ??= loadFieldKeyring((name) => config.get<string>(name))),
  };
}

/** Consulta que não funciona sobre texto cifrado. Nunca traz o valor filtrado. */
export class ClinicalTextQueryError extends Error {
  override readonly name = 'ClinicalTextQueryError';
}

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function isNullSentinel(value: unknown): boolean {
  return value === Prisma.DbNull || value === Prisma.JsonNull || value === Prisma.AnyNull;
}

function oneOrMany<T>(value: unknown, map: (item: unknown) => T): T | T[] {
  return Array.isArray(value) ? value.map(map) : map(value);
}

function forEachOneOrMany(value: unknown, visit: (item: unknown) => void): void {
  if (Array.isArray(value)) value.forEach(visit);
  else visit(value);
}

// ── Gravação ────────────────────────────────────────────────────────────────

/**
 * Não cifra marcador do sistema (PLAINTEXT_MARKERS) nem o que já abre com as
 * chaves (ex.: valor copiado por SQL).
 */
function sealTextOnce(keyring: FieldKeyring, column: SealedColumn, text: string): string {
  if (column.markers.includes(text) || canOpen(keyring, text)) return text;
  return sealText(keyring, text);
}

function sealTextInput(keyring: FieldKeyring, column: SealedColumn, value: unknown): unknown {
  if (typeof value === 'string') return sealTextOnce(keyring, column, value);
  // update de String aceita `{ set: valor }`
  if (isPlainObject(value) && typeof value.set === 'string') {
    return { ...value, set: sealTextOnce(keyring, column, value.set) };
  }
  return value;
}

function sealJsonInput(keyring: FieldKeyring, value: unknown): unknown {
  if (value === undefined || value === null || isNullSentinel(value)) return value;
  if (typeof value === 'string' && canOpen(keyring, value)) return value;
  return sealJson(keyring, value);
}

function sealData(model: string, data: unknown, keyring: FieldKeyring): unknown {
  if (Array.isArray(data)) return data.map((item) => sealData(model, item, keyring));
  if (!isPlainObject(data)) return data;

  const sealed = sealedFieldsOf(model);
  const relations = RELATIONS.get(model);
  let copy: JsonObject | null = null;
  for (const [key, value] of Object.entries(data)) {
    const column = sealed?.get(key);
    const related = relations?.get(key);
    let next = value;
    if (column?.kind === 'text') next = sealTextInput(keyring, column, value);
    else if (column?.kind === 'json') next = sealJsonInput(keyring, value);
    else if (related) next = sealNestedWrite(related, value, keyring);
    if (next !== value) {
      copy ??= { ...data };
      copy[key] = next;
    }
  }
  return copy ?? data;
}

/**
 * Escrita aninhada (`encounter.create({ data: { aiInteractions: { create } } })`).
 * Nenhum serviço faz isso hoje com estas tabelas; tratado para que um dia não
 * grave texto em claro com a flag ligada. Pressupõe que nenhum modelo tem um
 * campo chamado `data` (o to-one `update` aceita o dado direto ou `{ data }`).
 */
function sealNestedWrite(model: string, payload: unknown, keyring: FieldKeyring): unknown {
  if (!isPlainObject(payload)) return payload;
  const seal = (data: unknown) => sealData(model, data, keyring);
  const withData = (item: unknown) =>
    isPlainObject(item) && 'data' in item ? { ...item, data: seal(item.data) } : seal(item);
  const out: JsonObject = { ...payload };
  if ('create' in payload) out.create = seal(payload.create);
  if ('createMany' in payload) out.createMany = withData(payload.createMany);
  if ('connectOrCreate' in payload) {
    out.connectOrCreate = oneOrMany(payload.connectOrCreate, (item) =>
      isPlainObject(item) ? { ...item, create: seal(item.create) } : item,
    );
  }
  if ('upsert' in payload) {
    out.upsert = oneOrMany(payload.upsert, (item) =>
      isPlainObject(item)
        ? { ...item, create: seal(item.create), update: withData(item.update) }
        : item,
    );
  }
  if ('update' in payload) out.update = oneOrMany(payload.update, withData);
  if ('updateMany' in payload) out.updateMany = oneOrMany(payload.updateMany, withData);
  return out;
}

const WRITE_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  create: ['data'],
  createMany: ['data'],
  createManyAndReturn: ['data'],
  update: ['data'],
  updateMany: ['data'],
  updateManyAndReturn: ['data'],
  upsert: ['create', 'update'],
};

export function isWriteOperation(operation: string): boolean {
  return operation in WRITE_ARGUMENTS;
}

/** Cifra os campos de texto clínico dos argumentos de uma gravação, sem mutar o original. */
export function sealWriteArgs(
  model: string,
  operation: string,
  args: unknown,
  keyring: FieldKeyring,
): unknown {
  const keys = WRITE_ARGUMENTS[operation];
  if (!keys || !isPlainObject(args)) return args;
  const out: JsonObject = { ...args };
  for (const key of keys) {
    if (key in args) out[key] = sealData(model, args[key], keyring);
  }
  return out;
}

// ── Consultas que não funcionam sobre texto cifrado ─────────────────────────

const LOGICAL_OPERATORS = new Set(['AND', 'OR', 'NOT']);
const RELATION_FILTERS = ['some', 'every', 'none', 'is', 'isNot'] as const;

/**
 * O que ainda funciona sobre coluna cifrada: comparar com null e, por
 * igualdade, com um marcador do sistema gravado em claro (PLAINTEXT_MARKERS).
 */
function isFilterableOnSealed(column: SealedColumn, value: unknown): boolean {
  const comparable = (operand: unknown) =>
    operand === null ||
    isNullSentinel(operand) ||
    (typeof operand === 'string' && column.markers.includes(operand));
  if (comparable(value)) return true;
  if (!isPlainObject(value)) return false;
  const operators = Object.entries(value);
  return (
    operators.length > 0 &&
    operators.every(([operator, operand]) => {
      if (operator === 'equals' || operator === 'not') return comparable(operand);
      if (operator === 'in' || operator === 'notIn') {
        return Array.isArray(operand) && operand.every(comparable);
      }
      return false;
    })
  );
}

function assertFilterable(model: string, where: unknown): void {
  if (!isPlainObject(where)) return;
  const sealed = sealedFieldsOf(model);
  const relations = RELATIONS.get(model);
  for (const [key, value] of Object.entries(where)) {
    if (LOGICAL_OPERATORS.has(key)) {
      forEachOneOrMany(value, (inner) => assertFilterable(model, inner));
      continue;
    }
    const column = sealed?.get(key);
    if (column) {
      if (!isFilterableOnSealed(column, value)) {
        throw new ClinicalTextQueryError(
          `${model}.${key} é texto clínico cifrado: filtrar pelo conteúdo não funciona (só null / not null)`,
        );
      }
      continue;
    }
    const related = relations?.get(key);
    if (!related || !isPlainObject(value)) continue;
    const operators = RELATION_FILTERS.filter((operator) => operator in value);
    if (operators.length === 0) assertFilterable(related, value);
    for (const operator of operators) assertFilterable(related, value[operator]);
  }
}

function assertNotSealedField(model: string, field: unknown, clause: string): void {
  if (typeof field === 'string' && sealedFieldsOf(model)?.has(field)) {
    throw new ClinicalTextQueryError(
      `${model}.${field} é texto clínico cifrado: ${clause} por ele não funciona`,
    );
  }
}

/** Lança antes de ir ao banco se a consulta depende do conteúdo de um campo cifrado. */
export function assertQueryWorksOnSealedFields(model: string, args: unknown): void {
  if (!isPlainObject(args)) return;
  assertFilterable(model, args.where);
  forEachOneOrMany(args.orderBy, (item) => {
    if (isPlainObject(item)) {
      Object.keys(item).forEach((field) => assertNotSealedField(model, field, 'ordenar'));
    }
  });
  forEachOneOrMany(args.distinct, (field) => assertNotSealedField(model, field, 'distinct'));
  forEachOneOrMany(args.by, (field) => assertNotSealedField(model, field, 'agrupar'));
}

// ── Leitura ─────────────────────────────────────────────────────────────────

/** Decifra um valor lido do banco; texto em claro volta sem tocar nas chaves. */
export function openSealedField(
  cipher: ClinicalTextCipher,
  column: Pick<SealedColumn, 'model' | 'field' | 'kind'>,
  value: unknown,
): unknown {
  if (!isSealedText(value)) return value;
  try {
    return column.kind === 'json'
      ? openJson(cipher.keyring(), value)
      : openText(cipher.keyring(), value);
  } catch (err) {
    // Sem conteúdo na mensagem: só o campo e o motivo (chave, formato).
    const reason = err instanceof Error ? err.message : 'unknown error';
    throw new SealedValueError(`${column.model}.${column.field}: ${reason}`);
  }
}

type ComputedField = {
  needs: Record<string, true>;
  compute: (row: Record<string, unknown>) => unknown;
};

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function resultComponent(
  cipher: ClinicalTextCipher,
): Record<string, Record<string, ComputedField>> {
  const result: Record<string, Record<string, ComputedField>> = {};
  for (const column of SEALED_COLUMNS) {
    const fields = (result[lowerFirst(column.model)] ??= {});
    fields[column.field] = {
      needs: { [column.field]: true },
      compute: (row) => openSealedField(cipher, column, row[column.field]),
    };
  }
  return result;
}

export function clinicalTextEncryption(cipher: ClinicalTextCipher) {
  return Prisma.defineExtension({
    name: 'clinical-text-encryption',
    // Campos computados com o MESMO nome e tipo do campo do banco: os tipos
    // do cliente não mudam (ver PrismaService).
    result: resultComponent(cipher) as Record<string, never>,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertQueryWorksOnSealedFields(model, args);
          if (isWriteOperation(operation) && cipher.encryptWrites()) {
            return query(sealWriteArgs(model, operation, args, cipher.keyring()) as typeof args);
          }
          return query(args);
        },
      },
    },
  });
}

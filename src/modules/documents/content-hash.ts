import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';

/**
 * Selo de integridade dos documentos (`contentHash` + `contentHashVersion`).
 * Decisão e migração dos documentos já confirmados: ADR-012.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type DocumentContent = Prisma.InputJsonValue | Prisma.JsonValue;

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * v1 — algoritmo do CLIN-003 (#5) até o ADR-012. CONGELADO: existe só para
 * verificar documentos selados com ele; nunca usar para selar.
 *
 * O replacer em array filtra as chaves em TODOS os níveis, então objetos
 * aninhados perdem as chaves que não existem na raiz:
 * `{ medicamentos: [{ medicamento: 'AAS' }] }` → `{"medicamentos":[{}]}`.
 */
function hashV1Legacy(content: DocumentContent): string {
  return sha256Hex(JSON.stringify(content, Object.keys(content ?? {}).sort()));
}

/**
 * Normaliza para o JSON que o Postgres guarda (descarta `undefined`, aplica
 * `toJSON`), para o hash da geração bater com o recalculado a partir do banco.
 */
function toStoredJson(content: DocumentContent): JsonValue {
  return JSON.parse(JSON.stringify(content));
}

/**
 * Forma canônica RFC 8785 (JCS): chaves ordenadas por unidade UTF-16 em todos
 * os níveis, arrays na ordem original, números e strings como no
 * JSON.stringify. Qualquer implementação de JCS reproduz o mesmo texto.
 */
export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  const members = Object.entries(value)
    .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : 1))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`);
  return `{${members.join(',')}}`;
}

function hashV2Canonical(content: DocumentContent): string {
  return sha256Hex(canonicalJson(toStoredJson(content)));
}

const CONTENT_HASHERS = {
  1: hashV1Legacy,
  2: hashV2Canonical,
} as const;

export type ContentHashVersion = keyof typeof CONTENT_HASHERS;

export const CURRENT_CONTENT_HASH_VERSION = 2 satisfies ContentHashVersion;

export interface ContentSeal {
  contentHash: string;
  contentHashVersion: ContentHashVersion;
}

function isContentHashVersion(version: number | null): version is ContentHashVersion {
  return version !== null && Object.hasOwn(CONTENT_HASHERS, version);
}

/** Sela com a versão atual; espalhar o retorno no `data` do Prisma grava hash e versão juntos. */
export function sealContent(content: DocumentContent): ContentSeal {
  return {
    contentHash: CONTENT_HASHERS[CURRENT_CONTENT_HASH_VERSION](content),
    contentHashVersion: CURRENT_CONTENT_HASH_VERSION,
  };
}

/** Recalcula o hash com o algoritmo da versão gravada. Selo ausente ou versão desconhecida não verificam. */
export function verifyContentSeal(
  content: DocumentContent,
  seal: { contentHash: string | null; contentHashVersion: number | null },
): boolean {
  if (seal.contentHash === null || !isContentHashVersion(seal.contentHashVersion)) return false;
  return CONTENT_HASHERS[seal.contentHashVersion](content) === seal.contentHash;
}

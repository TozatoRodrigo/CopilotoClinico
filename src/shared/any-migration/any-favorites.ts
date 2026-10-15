import { ANY_REDIRECTS } from './any-redirects';
import {
  COPILOTO_CALCULATORS,
  COPILOTO_TOOL_IDS,
  type CopilotoCalculatorId,
  type CopilotoToolId,
} from './copiloto-tools-snapshot';

/**
 * CC-335 — favoritos do ANY recriados no Copiloto.
 *
 * No ANY v4 os favoritos são só de calculadora e moram no aparelho
 * (`localStorage`, chave `any-app-calc-favorites`, lista de ids do ANY); o
 * Supabase não os tem, então o export da base não traz favoritos. Fica
 * pronto o caminho para quando vierem (coluna `favoritos` do export ou uma
 * página-ponte no ANY que leia o `localStorage`):
 *
 * 1. `mapAnyFavorites` traduz ids do ANY para as chaves das Ferramentas
 *    (`calc:<id>` / `tool:<id>`, as de web/src/lib/tool-favorites.ts);
 * 2. `encodeFavoritesToken` junta tudo num parâmetro opaco (`?favoritos=`)
 *    para o link do convite — só ids de ferramenta, nada da pessoa;
 * 3. no primeiro acesso, o web lê o parâmetro com `decodeFavoritesToken`,
 *    junta aos favoritos do aparelho com `mergeMigratedFavorites` e tira o
 *    parâmetro do endereço. **Ponto de extensão:** a leitura no web entra
 *    junto com as Ferramentas (`useToolFavorites`), que ainda não estão na
 *    base deste código. A imagem do web não tem `../src` (ver
 *    src/shared/contracts/beta.ts): o web usa este arquivo pelo alias das
 *    Ferramentas, que a imagem copia (ADR-017), ou por um espelho em
 *    web/src/lib/ conferido em tests/web-mirrors/.
 */

/** Mesmo formato de `FavoriteKey` em web/src/lib/tool-favorites.ts. */
export type ToolFavoriteKey = `calc:${CopilotoCalculatorId}` | `tool:${CopilotoToolId}`;

/** Onde o ANY guarda os favoritos das calculadoras, no aparelho. */
export const ANY_CALC_FAVORITES_STORAGE_KEY = 'any-app-calc-favorites';
/** Parâmetro do link de convite com os favoritos migrados. */
export const MIGRATED_FAVORITES_PARAM = 'favoritos';
/** Limite das Ferramentas (`MAX_FAVORITES`); o ANY não tinha limite. */
export const MAX_TOOL_FAVORITES = 15;

const TOOL_IDS: ReadonlySet<string> = new Set(COPILOTO_TOOL_IDS);

function isToolId(value: string): value is CopilotoToolId {
  return TOOL_IDS.has(value);
}

/** Id de calculadora do ANY (com acento, em NFC) → chave no Copiloto. */
const CALCULATOR_FAVORITES: ReadonlyMap<string, ToolFavoriteKey> = new Map(
  COPILOTO_CALCULATORS.map(({ id, anyId }) => [anyId.normalize('NFC'), `calc:${id}` as const]),
);

/**
 * Chave de roteiro do hub do ANY (`acls`, `shock`… — o caminho sem a barra)
 * → chave no Copiloto. Sai do mesmo mapa dos redirecionamentos, para os dois
 * nunca discordarem.
 */
const TOOL_FAVORITES: ReadonlyMap<string, ToolFavoriteKey> = new Map(
  ANY_REDIRECTS.flatMap(({ from, to }): [string, ToolFavoriteKey][] => {
    const anyKey = /^\/([a-z]+)$/.exec(from)?.[1];
    const toolId = typeof to === 'string' ? /^\/ferramentas\/([a-z0-9-]+)$/.exec(to)?.[1] : null;
    return anyKey && toolId && isToolId(toolId) ? [[anyKey, `tool:${toolId}`]] : [];
  }),
);

export function mapAnyFavorite(anyId: string): ToolFavoriteKey | null {
  const normalized = anyId.trim().normalize('NFC');
  return CALCULATOR_FAVORITES.get(normalized) ?? TOOL_FAVORITES.get(normalized) ?? null;
}

export interface MappedFavorites {
  keys: ToolFavoriteKey[];
  /** Ids do ANY sem equivalente (contados, nunca listados no log). */
  unknown: number;
}

/** Traduz na ordem dada, sem repetir. */
export function mapAnyFavorites(anyIds: readonly string[]): MappedFavorites {
  const keys: ToolFavoriteKey[] = [];
  let unknown = 0;
  for (const anyId of anyIds) {
    if (anyId.trim() === '') continue;
    const key = mapAnyFavorite(anyId);
    if (!key) unknown++;
    else if (!keys.includes(key)) keys.push(key);
  }
  return { keys, unknown };
}

// ── Parâmetro opaco ─────────────────────────────────────────────────────────

/**
 * Versão 1 do parâmetro: um bit por chave, nesta ordem (roteiros, depois
 * calculadoras, como no instantâneo). A ordem é congelada: link já enviado
 * precisa abrir igual. Ferramenta nova entra numa versão 2, nunca no meio
 * desta lista (o teste fixa o conteúdo).
 */
export const FAVORITES_TOKEN_V1_KEYS: readonly ToolFavoriteKey[] = [
  ...COPILOTO_TOOL_IDS.map((id) => `tool:${id}` as const),
  ...COPILOTO_CALCULATORS.map(({ id }) => `calc:${id}` as const),
];

const TOKEN_V1 = '1';
const TOKEN_V1_BYTES = Math.ceil(FAVORITES_TOKEN_V1_KEYS.length / 8);
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Base64url à mão: o mesmo código roda na API e no web, sem Buffer nem btoa.
function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += BASE64URL[(buffer >> bits) & 63];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE64URL[(buffer << (6 - bits)) & 63];
  return out;
}

function fromBase64Url(text: string): Uint8Array | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = BASE64URL.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
    buffer &= (1 << bits) - 1;
  }
  return Uint8Array.from(bytes);
}

/** `null` quando não há o que levar: o link sai sem o parâmetro. */
export function encodeFavoritesToken(keys: readonly ToolFavoriteKey[]): string | null {
  const bytes = new Uint8Array(TOKEN_V1_BYTES);
  let marked = false;
  for (const key of keys) {
    const index = FAVORITES_TOKEN_V1_KEYS.indexOf(key);
    if (index < 0) continue;
    bytes[index >> 3] = (bytes[index >> 3] ?? 0) | (1 << (index & 7));
    marked = true;
  }
  return marked ? `${TOKEN_V1}${toBase64Url(bytes)}` : null;
}

/**
 * Lê o parâmetro sem confiar nele (link editado à mão, versão que este
 * código não conhece): o que não servir vira lista vazia, nunca erro.
 */
export function decodeFavoritesToken(token: string | null | undefined): ToolFavoriteKey[] {
  if (!token || !token.startsWith(TOKEN_V1)) return [];
  const bytes = fromBase64Url(token.slice(TOKEN_V1.length));
  if (!bytes || bytes.length !== TOKEN_V1_BYTES) return [];
  return FAVORITES_TOKEN_V1_KEYS.filter(
    (_key, index) => ((bytes[index >> 3] ?? 0) & (1 << (index & 7))) !== 0,
  );
}

/**
 * Os favoritos que o aparelho já tem vêm primeiro; os migrados entram
 * depois, sem repetir, até o limite das Ferramentas.
 */
export function mergeMigratedFavorites<K extends string>(
  current: readonly K[],
  migrated: readonly K[],
  max = MAX_TOOL_FAVORITES,
): K[] {
  const merged = [...new Set(current)];
  for (const key of migrated) {
    if (merged.length >= max) break;
    if (!merged.includes(key)) merged.push(key);
  }
  return merged.slice(0, max);
}

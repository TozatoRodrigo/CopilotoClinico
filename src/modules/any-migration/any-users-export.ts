import { z } from 'zod';
import { mapAnyFavorites, type ToolFavoriteKey } from '../../shared/any-migration/any-favorites';

/**
 * CC-335 — leitura do export de usuários do ANY (Supabase), no formato de
 * docs/any/migracao-e-desligamento.md: CSV com cabeçalho
 * `email,provedor,cadastro,ultimo_acesso` e, se houver, `favoritos`.
 *
 * Linha com problema não derruba o arquivo: vai para `problems` com o número
 * da linha e o motivo (nunca o conteúdo), e o operador corrige o export.
 */

export const ANY_EXPORT_REQUIRED_COLUMNS = [
  'email',
  'provedor',
  'cadastro',
  'ultimo_acesso',
] as const;
export const ANY_EXPORT_FAVORITES_COLUMN = 'favoritos';

/** `azure` é como o Supabase chama a Microsoft. */
export type AnyLoginProvider = 'google' | 'microsoft' | 'desconhecido';

export type AnyExportProblemReason =
  | 'email_invalido'
  | 'provedor_desconhecido'
  | 'cadastro_invalido'
  | 'ultimo_acesso_invalido'
  | 'colunas_a_mais_ou_a_menos';

export interface AnyExportProblem {
  /** Linha do arquivo (1 = cabeçalho). */
  line: number;
  reason: AnyExportProblemReason;
}

export interface AnyUserRecord {
  line: number;
  /** Minúsculo, sem espaços. */
  email: string;
  provider: AnyLoginProvider;
  signedUpAt: Date;
  /** `null` = nunca voltou depois do cadastro. */
  lastAccessAt: Date | null;
  favorites: ToolFavoriteKey[];
  unknownFavorites: number;
}

export interface AnyUsersExport {
  records: AnyUserRecord[];
  problems: AnyExportProblem[];
  hasFavoritesColumn: boolean;
}

/** Arquivo que não dá para ler (cabeçalho errado, aspas sem fechar). */
export class AnyExportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnyExportFormatError';
  }
}

interface CsvRecord {
  line: number;
  fields: string[];
}

/** CSV (RFC 4180): vírgula, aspas duplas com `""` dentro, CRLF ou LF, BOM opcional. */
export function parseCsv(text: string): CsvRecord[] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(field);
    // Linha em branco não é registro.
    if (fields.length > 1 || fields[0] !== '') records.push({ line: recordLine, fields });
    fields = [];
    field = '';
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (char === '\n') line++;
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') quoted = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else field += char;
  }
  if (quoted) throw new AnyExportFormatError(`Aspas sem fechar a partir da linha ${recordLine}`);
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

/**
 * Data do Postgres como o Supabase exporta (`2026-08-23 14:22:01.123456+00`)
 * ou ISO 8601. Sem fuso, vale UTC.
 */
const TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

export function parseExportTimestamp(raw: string): Date | null {
  const match = TIMESTAMP.exec(raw.trim());
  if (!match) return null;
  const [, date, time = '00:00:00', fraction = '', zone = 'Z'] = match;
  const seconds = time.length === 5 ? `${time}:00` : time;
  const millis = fraction ? `.${fraction.padEnd(3, '0').slice(0, 3)}` : '';
  const offset =
    zone.toUpperCase() === 'Z'
      ? 'Z'
      : `${zone.slice(0, 3)}:${zone.slice(3).replace(':', '').padEnd(2, '0')}`;
  const parsed = new Date(`${date}T${seconds}${millis}${offset}`);
  // `new Date` aceita 2026-02-31 e cai em março: confere o dia de volta.
  if (Number.isNaN(parsed.getTime())) return null;
  const sameDay = new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  return sameDay ? parsed : null;
}

/**
 * Começo de célula que planilha lê como fórmula (`=`, `+`, `-`, `@`) não
 * entra: o arquivo de envio é aberto em planilha e e-mail assim é raríssimo.
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .email()
  .refine((email) => !/^[=+\-@]/.test(email));

function parseProvider(raw: string): AnyLoginProvider | null {
  const value = raw.trim().toLowerCase();
  if (value === '') return 'desconhecido';
  if (value === 'google') return 'google';
  if (value === 'azure' || value === 'microsoft') return 'microsoft';
  return null;
}

function splitFavorites(raw: string): string[] {
  return raw
    .split(/[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseAnyUsersExport(text: string): AnyUsersExport {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new AnyExportFormatError('Arquivo vazio');

  const columns = header.fields.map((name) => name.trim().toLowerCase());
  const missing = ANY_EXPORT_REQUIRED_COLUMNS.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    throw new AnyExportFormatError(
      `Faltam colunas no cabeçalho: ${missing.join(', ')} (esperado: ${ANY_EXPORT_REQUIRED_COLUMNS.join(',')}[,${ANY_EXPORT_FAVORITES_COLUMN}])`,
    );
  }
  const index = (name: string) => columns.indexOf(name);
  const favoritesIndex = index(ANY_EXPORT_FAVORITES_COLUMN);

  const records: AnyUserRecord[] = [];
  const problems: AnyExportProblem[] = [];
  for (const { line, fields } of rows) {
    if (fields.length !== columns.length) {
      problems.push({ line, reason: 'colunas_a_mais_ou_a_menos' });
      continue;
    }
    const cell = (name: string) => fields[index(name)] ?? '';

    const email = emailSchema.safeParse(cell('email'));
    if (!email.success) {
      problems.push({ line, reason: 'email_invalido' });
      continue;
    }
    const provider = parseProvider(cell('provedor'));
    if (!provider) {
      problems.push({ line, reason: 'provedor_desconhecido' });
      continue;
    }
    const signedUpAt = parseExportTimestamp(cell('cadastro'));
    if (!signedUpAt) {
      problems.push({ line, reason: 'cadastro_invalido' });
      continue;
    }
    const rawLastAccess = cell('ultimo_acesso').trim();
    const lastAccessAt = rawLastAccess === '' ? null : parseExportTimestamp(rawLastAccess);
    if (rawLastAccess !== '' && !lastAccessAt) {
      problems.push({ line, reason: 'ultimo_acesso_invalido' });
      continue;
    }
    const favorites = mapAnyFavorites(
      favoritesIndex < 0 ? [] : splitFavorites(fields[favoritesIndex] ?? ''),
    );

    records.push({
      line,
      email: email.data,
      provider,
      signedUpAt,
      lastAccessAt,
      favorites: favorites.keys,
      unknownFavorites: favorites.unknown,
    });
  }

  return { records, problems, hasFavoritesColumn: favoritesIndex >= 0 };
}

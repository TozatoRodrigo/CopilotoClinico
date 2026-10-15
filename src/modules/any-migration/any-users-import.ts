import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { BetaInvite, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  encodeFavoritesToken,
  MIGRATED_FAVORITES_PARAM,
  type ToolFavoriteKey,
} from '../../shared/any-migration/any-favorites';
import {
  BETA_INVITE_LIMITS,
  BETA_INVITE_QUERY_PARAM,
  formatInviteCode,
} from '../../shared/contracts/beta';
import type { AuditService } from '../audit/audit.service';
import { addDays, type BetaInviteService } from '../beta/beta-invite.service';
import {
  parseAnyUsersExport,
  type AnyExportProblem,
  type AnyLoginProvider,
  type AnyUserRecord,
} from './any-users-export';

/**
 * CC-335 — leva os usuários do ANY para o Copiloto pelo beta por convite
 * (CC-702): um convite de uso único por pessoa, no lote "base ANY", e o
 * arquivo de envio (e-mail + link + data de mudança) para o canal de e-mail.
 *
 * - Quem já tem conta no Copiloto (mesmo e-mail) não ganha convite nem é
 *   vinculado: recebe só o aviso, com o link das Ferramentas.
 * - A base legal vai para a trilha ANTES de qualquer convite: sem registro,
 *   nada é criado.
 * - E-mail só existe no arquivo de envio. Trilha, log e relatório levam
 *   contagens, ids e números de linha.
 * - `dryRun` lê o banco e não grava nada.
 */

export const ANY_BATCH_LABEL = 'base ANY';
export const ANY_IMPORT_AUDIT_ACTION = 'ANY_USERS_IMPORT';
export const ANY_IMPORT_AUDIT_ENTITY = 'AnyImport';
/** Ativo = acessou nos 90 dias antes do import (a mesma janela da CC-301). */
export const ANY_ACTIVE_WINDOW_DAYS = 90;
export const ANY_INVITE_VALID_DAYS_DEFAULT = 90;
/** `createManyAndReturn` por partes, para não montar um INSERT gigante. */
const INVITE_CHUNK = 500;
const LOOKUP_CHUNK = 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `new Date` aceita 2027-02-30 e cai em março: confere o dia de volta. */
function isCalendarDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Texto que vai para a trilha: sem e-mail de ninguém. */
const traceableText = (min: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(500)
    .refine((text) => !text.includes('@'), 'Sem e-mail no texto: ele vai para a trilha');

export const anyImportOptionsSchema = z.object({
  /** Hipótese legal e documento que a sustenta (ex.: cessão da CC-301). */
  legalBasis: traceableText(10),
  /** AAAA-MM-DD: o dia em que any.app.br passa a redirecionar (CC-336). */
  changeDate: z
    .string()
    .regex(ISO_DATE, 'Use AAAA-MM-DD')
    .refine(isCalendarDate, 'Data inexistente'),
  /** Origem pública do web, base dos links (como `WEB_PUBLIC_URL`). */
  site: z
    .string()
    .url()
    .transform((raw) => new URL(raw))
    .refine(
      (url) =>
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash,
      'Use a origem do web (https, sem caminho)',
    )
    .transform((url) => url.origin),
  adminEmail: z.string().trim().toLowerCase().email(),
  validDays: z
    .number()
    .int()
    .min(1)
    .max(BETA_INVITE_LIMITS.validDaysMax)
    .default(ANY_INVITE_VALID_DAYS_DEFAULT),
  /** sha256 do arquivo: o mesmo export não entra duas vezes. */
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  dryRun: z.boolean().default(false),
  /** Já houve import antes: este é um export complementar (só gente nova). */
  complementary: z.boolean().default(false),
});

export type AnyImportOptions = z.input<typeof anyImportOptionsSchema>;
type ParsedOptions = z.output<typeof anyImportOptionsSchema>;

/**
 * Por que o import não grava. Linha inválida bloqueia: quem ficasse de fora
 * não seria avisado, então o export é corrigido e roda de novo.
 */
export type AnyImportBlock =
  | 'linhas_invalidas'
  | 'mesmo_arquivo_ja_importado'
  | 'import_anterior_sem_complementar';

export interface AnyImportReport {
  dryRun: boolean;
  /** Linhas do export lidas (sem o cabeçalho e as em branco). */
  rows: number;
  invalid: AnyExportProblem[];
  /** E-mail repetido no próprio arquivo (fica a primeira linha). */
  duplicatesInFile: number;
  /** Já têm conta no Copiloto: só aviso, sem convite. */
  existingAccounts: number;
  /** Convites a criar (ou criados). */
  invites: number;
  /** Acessaram o ANY nos últimos 90 dias: a base da meta de 60%. */
  activeUsers: number;
  providers: Record<AnyLoginProvider, number>;
  favorites: { column: boolean; usersWithFavorites: number; unknownIds: number };
  previousImports: number;
  blocked: AnyImportBlock | null;
  batchLabel: string;
  changeDate: string;
  inviteExpiresAt: string;
  importId: string | null;
}

export type AnyDeliveryKind = 'convite' | 'aviso';

/** Uma linha do arquivo de envio. Único lugar com e-mail. */
export interface AnyDelivery {
  email: string;
  kind: AnyDeliveryKind;
  provider: AnyLoginProvider;
  link: string;
  inviteCode: string | null;
  changeDate: string;
  inviteValidUntil: string | null;
}

export interface AnyImportResult {
  report: AnyImportReport;
  deliveries: AnyDelivery[];
}

/** Recusa antes de gravar qualquer coisa (opção inválida, admin inexistente). */
export class AnyImportRefusedError extends Error {
  constructor(
    readonly reason: 'opcoes_invalidas' | 'admin_nao_encontrado' | 'data_de_mudanca_no_passado',
    message: string,
  ) {
    super(message);
    this.name = 'AnyImportRefusedError';
  }
}

export type AnyImportPrisma = Pick<PrismaClient, '$queryRaw'> & {
  physician: Pick<PrismaClient['physician'], 'findFirst'>;
  auditLog: Pick<PrismaClient['auditLog'], 'findMany'>;
};

export interface AnyImportDeps {
  prisma: AnyImportPrisma;
  invites: Pick<BetaInviteService, 'insertInvites'>;
  audit: Pick<AuditService, 'log'>;
}

const logger = new Logger('AnyUsersImport');

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** E-mails (minúsculos) que já têm conta. O banco guarda como foi digitado. */
async function existingAccountEmails(
  prisma: AnyImportPrisma,
  emails: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks(emails, LOOKUP_CHUNK)) {
    const rows = await prisma.$queryRaw<{ email: string }[]>`
      SELECT lower(email) AS email FROM physicians WHERE lower(email) = ANY(${part}::text[])`;
    for (const row of rows) found.add(row.email);
  }
  return found;
}

async function previousImportHashes(prisma: AnyImportPrisma): Promise<string[]> {
  const entries = await prisma.auditLog.findMany({
    where: { action: ANY_IMPORT_AUDIT_ACTION },
    select: { payload: true },
  });
  return entries.map(({ payload }) => {
    const hash =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload.fileSha256
        : undefined;
    return typeof hash === 'string' ? hash : '';
  });
}

function emptyProviders(): Record<AnyLoginProvider, number> {
  return { google: 0, microsoft: 0, desconhecido: 0 };
}

function withQuery(path: string, query: Record<string, string | null>): string {
  const pairs = Object.entries(query).filter((entry): entry is [string, string] => !!entry[1]);
  if (pairs.length === 0) return path;
  return `${path}?${pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

function favoritesParam(favorites: readonly ToolFavoriteKey[]): Record<string, string | null> {
  return { [MIGRATED_FAVORITES_PARAM]: encodeFavoritesToken(favorites) };
}

/**
 * Mesmo e-mail duas vezes (conta Google e Microsoft da mesma pessoa no
 * Supabase): fica a primeira linha, com os favoritos das duas.
 */
function dedupeByEmail(records: readonly AnyUserRecord[]): {
  people: AnyUserRecord[];
  duplicatesInFile: number;
} {
  const unique = new Map<string, AnyUserRecord>();
  let duplicatesInFile = 0;
  for (const record of records) {
    const first = unique.get(record.email);
    if (!first) {
      unique.set(record.email, { ...record, favorites: [...record.favorites] });
      continue;
    }
    duplicatesInFile++;
    first.favorites.push(...record.favorites.filter((key) => !first.favorites.includes(key)));
    first.unknownFavorites += record.unknownFavorites;
  }
  return { people: [...unique.values()], duplicatesInFile };
}

export async function importAnyUsers(
  deps: AnyImportDeps,
  csvText: string,
  rawOptions: AnyImportOptions,
  now: Date = new Date(),
): Promise<AnyImportResult> {
  const parsedOptions = anyImportOptionsSchema.safeParse(rawOptions);
  if (!parsedOptions.success) {
    const fields = parsedOptions.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new AnyImportRefusedError('opcoes_invalidas', `Opções inválidas: ${fields}`);
  }
  const options: ParsedOptions = parsedOptions.data;
  if (options.changeDate < now.toISOString().slice(0, 10)) {
    throw new AnyImportRefusedError(
      'data_de_mudanca_no_passado',
      'A data de mudança já passou: o convite diria uma data que não vale mais',
    );
  }

  const expiresAt = addDays(now, options.validDays);
  if (expiresAt.toISOString().slice(0, 10) <= options.changeDate) {
    throw new AnyImportRefusedError(
      'opcoes_invalidas',
      'O convite venceria antes da data de mudança: aumente --validade-dias',
    );
  }

  const parsed = parseAnyUsersExport(csvText);
  const { people, duplicatesInFile } = dedupeByEmail(parsed.records);

  const admin = await deps.prisma.physician.findFirst({
    where: { email: { equals: options.adminEmail, mode: 'insensitive' }, role: 'ADMIN' },
    select: { id: true },
  });
  if (!admin) {
    throw new AnyImportRefusedError(
      'admin_nao_encontrado',
      'Nenhuma conta ADMIN com o e-mail de --admin',
    );
  }

  const existing = await existingAccountEmails(
    deps.prisma,
    people.map(({ email }) => email),
  );
  const invitees = people.filter(({ email }) => !existing.has(email));
  const notices = people.filter(({ email }) => existing.has(email));

  const previous = await previousImportHashes(deps.prisma);
  const blocked: AnyImportBlock | null =
    parsed.problems.length > 0
      ? 'linhas_invalidas'
      : previous.includes(options.fileSha256)
        ? 'mesmo_arquivo_ja_importado'
        : previous.length > 0 && !options.complementary
          ? 'import_anterior_sem_complementar'
          : null;

  const activeSince = addDays(now, -ANY_ACTIVE_WINDOW_DAYS);
  const providers = emptyProviders();
  for (const person of people) providers[person.provider]++;

  const report: AnyImportReport = {
    dryRun: options.dryRun,
    rows: parsed.records.length + parsed.problems.length,
    invalid: parsed.problems,
    duplicatesInFile,
    existingAccounts: notices.length,
    invites: invitees.length,
    activeUsers: people.filter(({ lastAccessAt }) => lastAccessAt && lastAccessAt >= activeSince)
      .length,
    providers,
    favorites: {
      column: parsed.hasFavoritesColumn,
      usersWithFavorites: people.filter(({ favorites }) => favorites.length > 0).length,
      unknownIds: people.reduce((sum, { unknownFavorites }) => sum + unknownFavorites, 0),
    },
    previousImports: previous.length,
    blocked,
    batchLabel: ANY_BATCH_LABEL,
    changeDate: options.changeDate,
    inviteExpiresAt: expiresAt.toISOString(),
    importId: null,
  };

  logger.log(
    `ANY_IMPORT_PLANNED dryRun=${options.dryRun} rows=${report.rows} invalid=${report.invalid.length} ` +
      `duplicates=${duplicatesInFile} existing=${notices.length} invites=${invitees.length} ` +
      `active=${report.activeUsers} blocked=${blocked ?? 'no'}`,
  );

  if (options.dryRun || blocked || people.length === 0) return { report, deliveries: [] };

  // Base legal primeiro: se a trilha falhar, nenhum convite existe sem ela.
  const importId = randomUUID();
  await deps.audit.log({
    actorId: admin.id,
    action: ANY_IMPORT_AUDIT_ACTION,
    entity: ANY_IMPORT_AUDIT_ENTITY,
    entityId: importId,
    payload: {
      legalBasis: options.legalBasis,
      fileSha256: options.fileSha256,
      batchLabel: ANY_BATCH_LABEL,
      changeDate: options.changeDate,
      validDays: options.validDays,
      complementary: options.complementary,
      rows: report.rows,
      invalidRows: report.invalid.length,
      duplicatesInFile,
      existingAccounts: notices.length,
      invites: invitees.length,
      activeUsers: report.activeUsers,
      providers,
    },
  });

  const created: BetaInvite[] = [];
  for (const part of chunks(invitees, INVITE_CHUNK)) {
    created.push(
      ...(await deps.invites.insertInvites(
        { batchLabel: ANY_BATCH_LABEL, maxUses: 1, expiresAt, createdById: admin.id },
        part.length,
      )),
    );
  }

  await deps.audit
    .log({
      actorId: admin.id,
      action: 'BETA_INVITES_CREATED',
      entity: 'BetaInvite',
      entityId: created[0]?.id ?? 'none',
      payload: {
        batchLabel: ANY_BATCH_LABEL,
        quantity: created.length,
        maxUses: 1,
        validDays: options.validDays,
        inviteIds: created.map(({ id }) => id),
        importId,
      },
    })
    .catch((err: unknown) => {
      // Os convites existem e a base legal já está na trilha: segue.
      logger.error(
        `ANY_IMPORT_AUDIT_FAILED action=BETA_INVITES_CREATED importId=${importId}: ${err instanceof Error ? err.message : 'erro'}`,
      );
    });

  const validUntil = expiresAt.toISOString().slice(0, 10);
  // Os convites do lote são iguais, só o código muda: qualquer pareamento serve.
  const deliveries: AnyDelivery[] = [
    ...invitees.map((person, i): AnyDelivery => {
      const invite = created[i];
      if (!invite) throw new Error('Faltou convite para o lote do ANY');
      const code = formatInviteCode(invite.code);
      return {
        email: person.email,
        kind: 'convite',
        provider: person.provider,
        link: `${options.site}${withQuery('/register', {
          [BETA_INVITE_QUERY_PARAM]: code,
          ...favoritesParam(person.favorites),
        })}`,
        inviteCode: code,
        changeDate: options.changeDate,
        inviteValidUntil: validUntil,
      };
    }),
    ...notices.map(
      (person): AnyDelivery => ({
        email: person.email,
        kind: 'aviso',
        provider: person.provider,
        link: `${options.site}${withQuery('/ferramentas', favoritesParam(person.favorites))}`,
        inviteCode: null,
        changeDate: options.changeDate,
        inviteValidUntil: null,
      }),
    ),
  ];

  logger.log(
    `ANY_IMPORT_DONE importId=${importId} invites=${created.length} notices=${notices.length}`,
  );
  return { report: { ...report, importId }, deliveries };
}

// ── Arquivo de envio ────────────────────────────────────────────────────────

export const ANY_SEND_FILE_COLUMNS = [
  'email',
  'tipo',
  'provedor',
  'link',
  'codigo_convite',
  'data_mudanca',
  'data_mudanca_texto',
  'convite_valido_ate',
] as const;

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** `2027-02-15` → `15/02/2027`, para o texto do e-mail. */
function brazilianDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * CSV para o e-mail transacional (CC-015) ou mala direta: uma linha por
 * pessoa. Contém e-mails: apagar depois do envio (ver o runbook).
 */
export function renderSendFile(deliveries: readonly AnyDelivery[]): string {
  const lines = [ANY_SEND_FILE_COLUMNS.join(',')];
  for (const delivery of deliveries) {
    lines.push(
      [
        delivery.email,
        delivery.kind,
        delivery.provider,
        delivery.link,
        delivery.inviteCode ?? '',
        delivery.changeDate,
        brazilianDate(delivery.changeDate),
        delivery.inviteValidUntil ?? '',
      ]
        .map(csvField)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

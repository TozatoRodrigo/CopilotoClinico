import { Prisma, type PrismaClient } from '@prisma/client';
import {
  SEALED_PREFIX,
  isSealedText,
  openJson,
  openText,
  sealText,
  sealedKeyId,
  type FieldKeyring,
} from '../../shared/crypto/field-cipher';
import { SEALED_COLUMNS, type SealedColumn } from './clinical-text-fields';

/**
 * CC-207 — cifra em lote o texto clínico gravado antes da flag, e confere que
 * nada ficou em claro (`--verify`). Usado por scripts/encrypt-clinical-text.ts.
 *
 * Idempotente e retomável: só lê o que ainda não está cifrado com a chave
 * atual, então rodar de novo — depois de uma interrupção, ou com a API
 * gravando ao mesmo tempo — continua de onde parou. Cada linha é gravada com
 * "compare-and-set" (só se a coluna ainda tem o valor lido): uma edição
 * concorrente da API nunca é sobrescrita; a linha fica para a próxima rodada.
 *
 * Também faz a rotação: valor cifrado com FIELD_ENCRYPTION_KEY_PREVIOUS é
 * aberto e cifrado de novo com a chave atual. E o caminho de volta
 * (`--decrypt`), só para voltar a API a uma versão anterior ao CC-207.
 *
 * Nunca registra texto: relatórios só com contagens e ids.
 */

/** Uma linha pendente. `raw` é o valor como está no banco (texto do jsonb para Json). */
export interface PendingValue {
  id: string;
  raw: string;
  /** O texto que o valor guarda: o próprio `raw`, ou a string de dentro do jsonb. */
  text: string;
}

export interface ColumnCensus {
  /** Linhas com valor (NULL, JSON null e marcadores do sistema não contam). */
  total: number;
  plaintext: number;
  /** Cifrados, por id de chave. */
  sealedByKey: Record<string, number>;
}

/** Acesso ao banco, separado para os testes exercitarem a lógica sem Postgres. */
export interface ClinicalTextStore {
  /** Até `limit` valores não cifrados com `currentKeyId`, por id crescente depois de `afterId`. */
  pendingBatch(
    column: SealedColumn,
    currentKeyId: string,
    afterId: string | null,
    limit: number,
  ): Promise<PendingValue[]>;
  /** Até `limit` valores cifrados (qualquer chave), por id crescente depois de `afterId`. */
  sealedBatch(column: SealedColumn, afterId: string | null, limit: number): Promise<PendingValue[]>;
  /** Grava `sealed` só se a coluna ainda guarda `raw`; devolve se gravou. */
  replaceIfUnchanged(
    column: SealedColumn,
    id: string,
    raw: string,
    sealed: string,
  ): Promise<boolean>;
  /** Grava o texto em claro (para Json, o texto JSON) só se a coluna ainda guarda `raw`. */
  restoreIfUnchanged(
    column: SealedColumn,
    id: string,
    raw: string,
    plaintext: string,
  ): Promise<boolean>;
  census(column: SealedColumn): Promise<ColumnCensus>;
}

export interface EncryptColumnReport {
  table: string;
  column: string;
  /** Lidos ainda sem a chave atual. */
  pending: number;
  /** Cifrados agora (ou que seriam, no dry-run). */
  sealed: number;
  /** Destes, cifrados antes com a chave anterior (rotação). */
  rotated: number;
  /** Mudaram entre a leitura e a gravação: ficam para a próxima rodada. */
  skippedConcurrent: number;
  /** Cifrados com chave desconhecida ou corrompidos: não dá para abrir. */
  failed: number;
  failedIds: string[];
}

export interface EncryptReport {
  dryRun: boolean;
  keyId: string;
  columns: EncryptColumnReport[];
}

export interface EncryptOptions {
  batchSize: number;
  dryRun: boolean;
  columns?: readonly SealedColumn[];
  /** Progresso por lote (só contagens). */
  onBatch?: (report: EncryptColumnReport) => void;
}

const FAILED_ID_SAMPLE = 20;

function columnLabel(column: SealedColumn): Pick<EncryptColumnReport, 'table' | 'column'> {
  return { table: column.table, column: column.column };
}

/**
 * O texto a cifrar. Valor já cifrado (com a chave anterior) é aberto antes;
 * para Json, confere que o conteúdo é JSON — é o que a leitura vai fazer.
 */
function plaintextOf(column: SealedColumn, value: PendingValue, keyring: FieldKeyring): string {
  if (!isSealedText(value.text)) return column.kind === 'json' ? value.raw : value.text;
  const text = openText(keyring, value.text);
  if (column.kind === 'json') JSON.parse(text);
  return text;
}

async function encryptColumn(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  column: SealedColumn,
  options: EncryptOptions,
): Promise<EncryptColumnReport> {
  const report: EncryptColumnReport = {
    ...columnLabel(column),
    pending: 0,
    sealed: 0,
    rotated: 0,
    skippedConcurrent: 0,
    failed: 0,
    failedIds: [],
  };

  let afterId: string | null = null;
  while (true) {
    const batch = await store.pendingBatch(column, keyring.current.id, afterId, options.batchSize);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1]!.id;
    report.pending += batch.length;

    for (const value of batch) {
      const rotating = isSealedText(value.text);
      let plaintext: string;
      try {
        plaintext = plaintextOf(column, value, keyring);
      } catch {
        report.failed++;
        if (report.failedIds.length < FAILED_ID_SAMPLE) report.failedIds.push(value.id);
        continue;
      }
      if (!options.dryRun) {
        const written = await store.replaceIfUnchanged(
          column,
          value.id,
          value.raw,
          sealText(keyring, plaintext),
        );
        if (!written) {
          report.skippedConcurrent++;
          continue;
        }
      }
      report.sealed++;
      if (rotating) report.rotated++;
    }
    options.onBatch?.(report);
  }
  return report;
}

export async function encryptClinicalText(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  options: EncryptOptions,
): Promise<EncryptReport> {
  const columns: EncryptColumnReport[] = [];
  for (const column of options.columns ?? SEALED_COLUMNS) {
    columns.push(await encryptColumn(store, keyring, column, options));
  }
  return { dryRun: options.dryRun, keyId: keyring.current.id, columns };
}

export interface DecryptColumnReport {
  table: string;
  column: string;
  /** Valores cifrados encontrados. */
  found: number;
  /** Gravados em claro agora (ou que seriam, no dry-run). */
  restored: number;
  skippedConcurrent: number;
  failed: number;
  failedIds: string[];
}

export interface DecryptReport {
  dryRun: boolean;
  columns: DecryptColumnReport[];
}

/** O texto que o valor cifrado guarda; para Json, confere que é JSON. */
function openedText(column: SealedColumn, value: PendingValue, keyring: FieldKeyring): string {
  const text = openText(keyring, value.text);
  if (column.kind === 'json') JSON.parse(text);
  return text;
}

async function decryptColumn(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  column: SealedColumn,
  options: { batchSize: number; dryRun: boolean; onBatch?: (report: DecryptColumnReport) => void },
): Promise<DecryptColumnReport> {
  const report: DecryptColumnReport = {
    ...columnLabel(column),
    found: 0,
    restored: 0,
    skippedConcurrent: 0,
    failed: 0,
    failedIds: [],
  };
  let afterId: string | null = null;
  while (true) {
    const batch = await store.sealedBatch(column, afterId, options.batchSize);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1]!.id;
    report.found += batch.length;
    for (const value of batch) {
      let plaintext: string;
      try {
        plaintext = openedText(column, value, keyring);
      } catch {
        report.failed++;
        if (report.failedIds.length < FAILED_ID_SAMPLE) report.failedIds.push(value.id);
        continue;
      }
      if (!options.dryRun) {
        const written = await store.restoreIfUnchanged(column, value.id, value.raw, plaintext);
        if (!written) {
          report.skippedConcurrent++;
          continue;
        }
      }
      report.restored++;
    }
    options.onBatch?.(report);
  }
  return report;
}

/**
 * Caminho de volta: grava em claro tudo o que está cifrado. Só para voltar a
 * API a uma versão anterior ao CC-207 (que não lê `enc:v1:`), com a flag já
 * desligada — com a versão atual, desligar a flag basta.
 */
export async function decryptClinicalText(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  options: {
    batchSize: number;
    dryRun: boolean;
    columns?: readonly SealedColumn[];
    onBatch?: (report: DecryptColumnReport) => void;
  },
): Promise<DecryptReport> {
  const columns: DecryptColumnReport[] = [];
  for (const column of options.columns ?? SEALED_COLUMNS) {
    columns.push(await decryptColumn(store, keyring, column, options));
  }
  return { dryRun: options.dryRun, columns };
}

export interface VerifyColumnReport {
  table: string;
  column: string;
  total: number;
  plaintext: number;
  sealedCurrentKey: number;
  /** Cifrados com a chave anterior: rotação por terminar. Não é falha. */
  sealedPreviousKey: number;
  /** Cifrados com chave que não está no ambiente. */
  sealedUnknownKey: number;
  /** Têm o prefixo mas não abrem (formato, auth tag, Json inválido). */
  undecryptable: number;
  undecryptableIds: string[];
}

export interface VerifyReport {
  /** Nada em claro, nada que não abra. */
  ok: boolean;
  keyId: string;
  previousKeyId: string | null;
  columns: VerifyColumnReport[];
}

async function verifyColumn(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  column: SealedColumn,
  batchSize: number,
): Promise<VerifyColumnReport> {
  const census = await store.census(column);
  const countFor = (keyId: string | undefined) => (keyId ? (census.sealedByKey[keyId] ?? 0) : 0);
  const known = countFor(keyring.current.id) + countFor(keyring.previous?.id);
  const sealedTotal = Object.values(census.sealedByKey).reduce((sum, count) => sum + count, 0);

  const report: VerifyColumnReport = {
    ...columnLabel(column),
    total: census.total,
    plaintext: census.plaintext,
    sealedCurrentKey: countFor(keyring.current.id),
    sealedPreviousKey: countFor(keyring.previous?.id),
    sealedUnknownKey: sealedTotal - known,
    undecryptable: 0,
    undecryptableIds: [],
  };

  // Abre cada valor cifrado: prova que a chave do ambiente é a que cifrou e
  // que nenhum valor foi truncado ou alterado.
  let afterId: string | null = null;
  while (true) {
    const batch = await store.sealedBatch(column, afterId, batchSize);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1]!.id;
    for (const value of batch) {
      const keyId = sealedKeyId(value.text);
      if (keyId !== keyring.current.id && keyId !== keyring.previous?.id && keyId !== null) {
        continue; // já contado em sealedUnknownKey
      }
      try {
        if (column.kind === 'json') openJson(keyring, value.text);
        else openText(keyring, value.text);
      } catch {
        report.undecryptable++;
        if (report.undecryptableIds.length < FAILED_ID_SAMPLE) {
          report.undecryptableIds.push(value.id);
        }
      }
    }
  }
  return report;
}

export async function verifyClinicalText(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  options: { batchSize: number; columns?: readonly SealedColumn[] },
): Promise<VerifyReport> {
  const columns: VerifyColumnReport[] = [];
  for (const column of options.columns ?? SEALED_COLUMNS) {
    columns.push(await verifyColumn(store, keyring, column, options.batchSize));
  }
  return {
    ok: columns.every(
      (column) =>
        column.plaintext === 0 && column.sealedUnknownKey === 0 && column.undecryptable === 0,
    ),
    keyId: keyring.current.id,
    previousKeyId: keyring.previous?.id ?? null,
    columns,
  };
}

// ── Postgres ────────────────────────────────────────────────────────────────

type RawClient = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

/** Identificadores vêm do DMMF do Prisma, nunca de entrada externa. */
function quoted(identifier: string): Prisma.Sql {
  return Prisma.raw(`"${identifier.replace(/"/g, '""')}"`);
}

const SEALED_LIKE = `${SEALED_PREFIX}%`;
/** Posição (1-based) e tamanho do id da chave em `enc:v1:<id>:…`, como SQL literal. */
const KEY_ID_START = Prisma.raw(String(SEALED_PREFIX.length + 1));
const KEY_ID_LENGTH = Prisma.raw('8');

/**
 * SQL de cada tipo de coluna: `textOf` é a string guardada (para Json, a de
 * dentro do jsonb quando o valor é uma string JSON), `present` exclui NULL,
 * JSON null e os marcadores do sistema.
 */
function columnSql(column: SealedColumn) {
  const table = quoted(column.table);
  const col = quoted(column.column);
  if (column.kind === 'text') {
    // Marcador do sistema (PLAINTEXT_MARKERS) fica em claro por desenho: fora
    // da contagem, da migração e da verificação.
    const present =
      column.markers.length > 0
        ? Prisma.sql`${col} IS NOT NULL AND ${col} NOT IN (${Prisma.join([...column.markers])})`
        : Prisma.sql`${col} IS NOT NULL`;
    return { table, col, raw: col, textOf: col, present };
  }
  return {
    table,
    col,
    raw: Prisma.sql`${col}::text`,
    textOf: Prisma.sql`(CASE WHEN jsonb_typeof(${col}) = 'string' THEN ${col} #>> '{}' END)`,
    present: Prisma.sql`${col} IS NOT NULL AND jsonb_typeof(${col}) <> 'null'`,
  };
}

interface Row {
  id: string;
  raw: string;
  text: string | null;
}

function toPending(rows: Row[]): PendingValue[] {
  return rows.map((row) => ({ id: row.id, raw: row.raw, text: row.text ?? row.raw }));
}

export class PrismaClinicalTextStore implements ClinicalTextStore {
  constructor(private readonly prisma: RawClient) {}

  async pendingBatch(
    column: SealedColumn,
    currentKeyId: string,
    afterId: string | null,
    limit: number,
  ): Promise<PendingValue[]> {
    const { table, raw, textOf, present } = columnSql(column);
    const currentLike = `${SEALED_PREFIX}${currentKeyId}:%`;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id::text AS id, ${raw} AS raw, ${textOf} AS text
      FROM ${table}
      WHERE ${present}
        AND (${textOf} IS NULL OR ${textOf} NOT LIKE ${currentLike})
        AND (${afterId}::uuid IS NULL OR id > ${afterId}::uuid)
      ORDER BY id
      LIMIT ${limit}`;
    return toPending(rows);
  }

  async sealedBatch(column: SealedColumn, afterId: string | null, limit: number) {
    const { table, raw, textOf, present } = columnSql(column);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id::text AS id, ${raw} AS raw, ${textOf} AS text
      FROM ${table}
      WHERE ${present} AND ${textOf} LIKE ${SEALED_LIKE}
        AND (${afterId}::uuid IS NULL OR id > ${afterId}::uuid)
      ORDER BY id
      LIMIT ${limit}`;
    return toPending(rows);
  }

  async replaceIfUnchanged(
    column: SealedColumn,
    id: string,
    raw: string,
    sealed: string,
  ): Promise<boolean> {
    const { table, col } = columnSql(column);
    const updated =
      column.kind === 'text'
        ? await this.prisma.$executeRaw`
            UPDATE ${table} SET ${col} = ${sealed}
            WHERE id = ${id}::uuid AND ${col} = ${raw}`
        : await this.prisma.$executeRaw`
            UPDATE ${table} SET ${col} = to_jsonb(${sealed}::text)
            WHERE id = ${id}::uuid AND ${col} = ${raw}::jsonb`;
    return updated === 1;
  }

  async restoreIfUnchanged(
    column: SealedColumn,
    id: string,
    raw: string,
    plaintext: string,
  ): Promise<boolean> {
    const { table, col } = columnSql(column);
    const updated =
      column.kind === 'text'
        ? await this.prisma.$executeRaw`
            UPDATE ${table} SET ${col} = ${plaintext}
            WHERE id = ${id}::uuid AND ${col} = ${raw}`
        : await this.prisma.$executeRaw`
            UPDATE ${table} SET ${col} = ${plaintext}::jsonb
            WHERE id = ${id}::uuid AND ${col} = ${raw}::jsonb`;
    return updated === 1;
  }

  async census(column: SealedColumn): Promise<ColumnCensus> {
    const { table, textOf, present } = columnSql(column);
    const [totals] = await this.prisma.$queryRaw<Array<{ total: bigint; plaintext: bigint }>>`
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE ${textOf} IS NULL OR ${textOf} NOT LIKE ${SEALED_LIKE})::bigint AS plaintext
      FROM ${table}
      WHERE ${present}`;
    const byKey = await this.prisma.$queryRaw<Array<{ key_id: string; count: bigint }>>`
      SELECT substring(${textOf} FROM ${KEY_ID_START} FOR ${KEY_ID_LENGTH}) AS key_id,
             count(*)::bigint AS count
      FROM ${table}
      WHERE ${present} AND ${textOf} LIKE ${SEALED_LIKE}
      GROUP BY 1`;
    return {
      total: Number(totals?.total ?? 0),
      plaintext: Number(totals?.plaintext ?? 0),
      sealedByKey: Object.fromEntries(byKey.map((row) => [row.key_id, Number(row.count)])),
    };
  }
}

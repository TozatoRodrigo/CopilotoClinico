import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import type { AuditLog } from '@prisma/client';
import type { AuditQueryInput } from './schemas/audit.schemas';
import {
  CANONICAL_AUDIT_HASH_VERSION,
  LegacyKeyOrderHints,
  canonicalEventText,
  canonicalJson,
  chainHashes,
  matchLegacyEvent,
  toJsonValue,
} from './audit-hash';
import type { AuditEventFields, JsonValue, LegacyUnverifiableReason } from './audit-hash';

const VERIFY_CHAIN_PAGE_SIZE = 1000;
const AUDIT_CHAIN_ADVISORY_LOCK_ID = 7_314_061;
const AUDIT_CHAIN_TRANSACTION_MAX_ATTEMPTS = 5;
/** Quantos "legado não verificável" o resultado lista por id (o total vem à parte). */
const LEGACY_UNVERIFIABLE_SAMPLE_SIZE = 20;

interface LogParams {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  afterHash?: string;
  payload?: Record<string, unknown>;
  ip?: string;
}

export interface LegacyUnverifiableRecord {
  id: string;
  reason: LegacyUnverifiableReason;
}

export interface ChainVerificationResult {
  valid: boolean;
  count: number;
  brokenAt?: string;
  message?: string;
  /** Registros com hash legado (`hash_version` NULL) — ver ADR-015. */
  legacy: {
    /** Texto original reconstruído e conferido. */
    verified: number;
    /** "Legado não verificável": o hash não se refaz a partir do jsonb. */
    unverifiable: number;
    unverifiableSample: LegacyUnverifiableRecord[];
  };
}

/** Linha lida para verificação; o payload vem como o texto que o banco guarda. */
interface ChainRow {
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

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async log(params: LogParams): Promise<AuditLog> {
    for (let attempt = 1; attempt <= AUDIT_CHAIN_TRANSACTION_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.writeAuditLogEntry(params);
      } catch (err: unknown) {
        if (
          attempt < AUDIT_CHAIN_TRANSACTION_MAX_ATTEMPTS &&
          this.isSerializableTransactionConflict(err)
        ) {
          continue;
        }

        throw err;
      }
    }

    throw new Error('Audit chain write failed after retry attempts');
  }

  private async writeAuditLogEntry(params: LogParams): Promise<AuditLog> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_ADVISORY_LOCK_ID})`;

        let timestamp = new Date();
        const lastEntry = await tx.auditLog.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { afterHash: true, createdAt: true },
        });

        if (lastEntry && timestamp <= lastEntry.createdAt) {
          timestamp = new Date(lastEntry.createdAt.getTime() + 1);
        }

        const payload = params.payload ? toJsonValue(params.payload) : null;
        const { afterHash, beforeHash } = chainHashes(
          canonicalEventText({
            actorId: params.actorId,
            action: params.action,
            entity: params.entity,
            entityId: params.entityId,
            payload,
            timestamp: timestamp.toISOString(),
          }),
          lastEntry?.afterHash ?? null,
        );
        const entry: AuditLog = {
          id: randomUUID(),
          actorId: params.actorId,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          beforeHash,
          afterHash,
          hashVersion: CANONICAL_AUDIT_HASH_VERSION,
          payload,
          ip: params.ip ?? null,
          createdAt: timestamp,
        };

        // SQL e não auditLog.create: o Prisma reescreve parte dos números não
        // inteiros de um Json ao gravar (até 4 ULPs) e o hash deixaria de
        // bater com o banco. O texto canônico vai direto para o ::jsonb, que
        // guarda o número exato. Data em UTC explícito, como o Prisma grava.
        await tx.$executeRaw`
          INSERT INTO audit_log (
            id, actor_id, action, entity, entity_id, before_hash, after_hash,
            hash_version, payload, ip, created_at
          ) VALUES (
            ${entry.id}::uuid, ${entry.actorId}, ${entry.action}, ${entry.entity},
            ${entry.entityId}, ${entry.beforeHash}, ${entry.afterHash},
            ${CANONICAL_AUDIT_HASH_VERSION}::smallint,
            ${payload === null ? null : canonicalJson(payload)}::jsonb, ${entry.ip},
            ${timestamp.toISOString()}::timestamptz AT TIME ZONE 'UTC'
          )`;

        return entry;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private isSerializableTransactionConflict(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2034'
    );
  }

  async query(params: AuditQueryInput): Promise<{ items: AuditLog[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (params.entity) {
      where.entity = params.entity;
    }
    if (params.entityId) {
      where.entityId = params.entityId;
    }
    if (params.actorId) {
      where.actorId = params.actorId;
    }
    if (params.from || params.to) {
      const createdAt: Record<string, Date> = {};
      if (params.from) createdAt.gte = params.from;
      if (params.to) createdAt.lte = params.to;
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * S25-AUD-01 — Converte items de auditoria para CSV.
   *
   * Escapa aspas duplas e campos com vírgula/newline seguindo RFC 4180.
   * Payload (JSON) é serializado como string escapada numa única coluna.
   * CabeçalhoContent-Disposition é setado no controller.
   */
  toCsv(items: AuditLog[]): string {
    const headers = [
      'createdAt',
      'actorId',
      'action',
      'entity',
      'entityId',
      'ip',
      'beforeHash',
      'afterHash',
      'hashVersion',
      'payload',
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      // Se contém vírgula, aspa, newline ou retorno — envolve em aspas e escapa aspas.
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = items.map((item) =>
      [
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : String(item.createdAt ?? ''),
        item.actorId,
        item.action,
        item.entity,
        item.entityId,
        item.ip ?? '',
        item.beforeHash ?? '',
        item.afterHash ?? '',
        item.hashVersion ?? '',
        item.payload,
      ]
        .map(escapeCsv)
        .join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Verifica a integridade da cadeia de hash do audit_log (ADR-015).
   *
   * Percorre os registros em ordem cronológica, em páginas de
   * VERIFY_CHAIN_PAGE_SIZE, refaz o texto hasheado de cada um a partir do
   * banco e confere o afterHash e o elo beforeHash com o registro anterior.
   *
   * - `hash_version` 2: JSON canônico; qualquer diferença é falha.
   * - `hash_version` NULL (legado): reconstrói o texto original testando as
   *   ordens de chave do payload e os vizinhos de cada número. Sem candidato
   *   que bata, é falha; se a busca não é conclusiva, o registro conta como
   *   "legado não verificável" e o elo dele com o próximo continua conferido
   *   (o beforeHash do próximo usa o afterHash gravado aqui).
   * - Registro legado depois do primeiro canônico é falha: desde a versão 2
   *   a aplicação só grava canônico, e rebaixar a versão não pode esconder
   *   adulteração.
   *
   * Para na primeira falha.
   */
  async verifyChain(): Promise<ChainVerificationResult> {
    const hints = new LegacyKeyOrderHints();
    const legacy: ChainVerificationResult['legacy'] = {
      verified: 0,
      unverifiable: 0,
      unverifiableSample: [],
    };
    let count = 0;
    let previousAfterHash: string | null = null;
    let canonicalStarted = false;

    const broken = (record: ChainRow, message: string): ChainVerificationResult => {
      this.logger.error(`Chain broken at record ${record.id}: ${message}`);
      return { valid: false, count, brokenAt: record.id, message, legacy };
    };

    for await (const record of this.chainRecords()) {
      count++;
      const event = eventFieldsOf(record);
      // Texto hasheado; null quando é legado não verificável.
      let eventText: string | null;

      if (record.hashVersion === CANONICAL_AUDIT_HASH_VERSION) {
        eventText = canonicalEventText(event);
        if (chainHashes(eventText, null).afterHash !== record.afterHash) {
          return broken(record, `afterHash mismatch at record ${record.id}`);
        }
        canonicalStarted = true;
      } else if (record.hashVersion !== null) {
        return broken(record, `unknown hash_version ${record.hashVersion} at record ${record.id}`);
      } else if (canonicalStarted) {
        return broken(
          record,
          `legacy hash after the canonical chain started at record ${record.id}`,
        );
      } else {
        const match = matchLegacyEvent(event, record.afterHash, hints);
        if (match.kind === 'mismatch') {
          return broken(record, `afterHash mismatch at record ${record.id} (legacy hash)`);
        }
        if (match.kind === 'unverifiable') {
          legacy.unverifiable++;
          if (legacy.unverifiableSample.length < LEGACY_UNVERIFIABLE_SAMPLE_SIZE) {
            legacy.unverifiableSample.push({ id: record.id, reason: match.reason });
          }
          eventText = null;
        } else {
          legacy.verified++;
          eventText = match.eventText;
        }
      }

      if (previousAfterHash !== null && eventText !== null) {
        if (chainHashes(eventText, previousAfterHash).beforeHash !== record.beforeHash) {
          return broken(record, `beforeHash mismatch at record ${record.id} — chain link severed`);
        }
      }

      previousAfterHash = record.afterHash;
    }

    this.logger.log(
      `Chain verification completed: ${count} records verified, chain intact ` +
        `(legacy: ${legacy.verified} verified, ${legacy.unverifiable} unverifiable)`,
    );
    return { valid: true, count, legacy };
  }

  /**
   * Registros em ordem de cadeia. SQL e não findMany para ler o payload como
   * o texto que o banco guarda (`payload::text`), sem depender de como o
   * Prisma converte números de um Json.
   */
  private async *chainRecords(): AsyncGenerator<ChainRow> {
    let cursor: string | null = null;

    while (true) {
      const after: Prisma.Sql = cursor
        ? Prisma.sql`WHERE (created_at, id) > (SELECT created_at, id FROM audit_log WHERE id = ${cursor}::uuid)`
        : Prisma.empty;
      const page: ChainRow[] = await this.prisma.$queryRaw<ChainRow[]>`
        SELECT id, actor_id AS "actorId", action, entity, entity_id AS "entityId",
               payload::text AS "payloadText", created_at AS "createdAt",
               after_hash AS "afterHash", before_hash AS "beforeHash",
               hash_version AS "hashVersion"
        FROM audit_log
        ${after}
        ORDER BY created_at ASC, id ASC
        LIMIT ${VERIFY_CHAIN_PAGE_SIZE}`;

      yield* page;

      const last = page.at(-1);
      if (!last || page.length < VERIFY_CHAIN_PAGE_SIZE) return;
      cursor = last.id;
    }
  }
}

function eventFieldsOf(record: ChainRow): AuditEventFields {
  return {
    actorId: record.actorId,
    action: record.action,
    entity: record.entity,
    entityId: record.entityId,
    payload: record.payloadText === null ? null : (JSON.parse(record.payloadText) as JsonValue),
    timestamp: record.createdAt.toISOString(),
  };
}

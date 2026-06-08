import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import type { AuditLog } from '@prisma/client';
import type { AuditQueryInput } from './schemas/audit.schemas';

const VERIFY_CHAIN_PAGE_SIZE = 1000;
const AUDIT_CHAIN_ADVISORY_LOCK_ID = 7_314_061;
const AUDIT_CHAIN_TRANSACTION_MAX_ATTEMPTS = 5;

interface LogParams {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  beforeHash?: string;
  afterHash?: string;
  payload?: Record<string, unknown>;
  ip?: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  count: number;
  brokenAt?: string;
  message?: string;
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

        const afterData = {
          actorId: params.actorId,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          payload: params.payload ?? null,
          timestamp: timestamp.toISOString(),
        };
        const afterHash = createHash('sha256').update(JSON.stringify(afterData)).digest('hex');

        let beforeHash = params.beforeHash;
        if (!beforeHash && lastEntry?.afterHash) {
          beforeHash = createHash('sha256')
            .update(lastEntry.afterHash + JSON.stringify(afterData))
            .digest('hex');
        }

        return tx.auditLog.create({
          data: {
            actorId: params.actorId,
            action: params.action,
            entity: params.entity,
            entityId: params.entityId,
            beforeHash,
            afterHash,
            payload: params.payload
              ? (params.payload as unknown as Prisma.InputJsonValue)
              : undefined,
            ip: params.ip,
            createdAt: timestamp,
          },
        });
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
   * Verifica a integridade da cadeia de hash do audit_log.
   *
   * Itera todos os registros em ordem cronológica (paginado em lotes de
   * VERIFY_CHAIN_PAGE_SIZE para não sobrecarregar a memória) e recomputa
   * o afterHash de cada registro a partir dos dados armazenados, comparando
   * com o valor salvo. Também verifica que o beforeHash de cada registro N
   * foi derivado corretamente do afterHash do registro N-1.
   *
   * Complexidade: O(n) — percorre cada registro uma vez.
   *
   * @returns ChainVerificationResult com valid, count, e brokenAt em caso de falha.
   */
  async verifyChain(): Promise<ChainVerificationResult> {
    let count = 0;
    let cursor: string | undefined;
    let prevAfterHash: string | null = null;

    while (true) {
      const page: Pick<
        AuditLog,
        | 'id'
        | 'actorId'
        | 'action'
        | 'entity'
        | 'entityId'
        | 'payload'
        | 'createdAt'
        | 'afterHash'
        | 'beforeHash'
      >[] = await this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'asc' },
        take: VERIFY_CHAIN_PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          actorId: true,
          action: true,
          entity: true,
          entityId: true,
          payload: true,
          createdAt: true,
          afterHash: true,
          beforeHash: true,
        },
      });

      if (page.length === 0) break;

      for (const record of page) {
        count++;

        // Recomputa o afterHash esperado com os mesmos dados usados no log()
        const afterData = {
          actorId: record.actorId,
          action: record.action,
          entity: record.entity,
          entityId: record.entityId,
          payload: (record.payload as Record<string, unknown> | null) ?? null,
          timestamp: record.createdAt.toISOString(),
        };
        const expectedAfterHash = createHash('sha256')
          .update(JSON.stringify(afterData))
          .digest('hex');

        if (record.afterHash !== expectedAfterHash) {
          this.logger.error(
            `Chain broken at record ${record.id}: afterHash mismatch. ` +
              `Expected ${expectedAfterHash}, got ${record.afterHash ?? 'null'}`,
          );
          return {
            valid: false,
            count,
            brokenAt: record.id,
            message: `afterHash mismatch at record ${record.id}`,
          };
        }

        // Para registros não-âncora, verifica o beforeHash
        if (prevAfterHash !== null) {
          const expectedBeforeHash = createHash('sha256')
            .update(prevAfterHash + JSON.stringify(afterData))
            .digest('hex');

          if (record.beforeHash !== expectedBeforeHash) {
            this.logger.error(
              `Chain broken at record ${record.id}: beforeHash mismatch. ` +
                `Expected ${expectedBeforeHash}, got ${record.beforeHash ?? 'null'}`,
            );
            return {
              valid: false,
              count,
              brokenAt: record.id,
              message: `beforeHash mismatch at record ${record.id} — chain link severed`,
            };
          }
        }

        prevAfterHash = record.afterHash ?? null;
        cursor = record.id;
      }

      if (page.length < VERIFY_CHAIN_PAGE_SIZE) break;
    }

    this.logger.log(`Chain verification completed: ${count} records verified, chain intact`);
    return { valid: true, count };
  }
}

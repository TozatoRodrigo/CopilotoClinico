import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import type { AuditLog } from '@prisma/client';
import type { AuditQueryInput } from './schemas/audit.schemas';

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

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogParams): Promise<AuditLog> {
    const timestamp = new Date();

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
    if (!beforeHash) {
      const lastEntry = await this.prisma.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { afterHash: true },
      });
      if (lastEntry?.afterHash) {
        beforeHash = createHash('sha256')
          .update(lastEntry.afterHash + JSON.stringify(afterData))
          .digest('hex');
      }
    }

    return this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        beforeHash,
        afterHash,
        payload: params.payload ? (params.payload as unknown as Prisma.InputJsonValue) : undefined,
        ip: params.ip,
      },
    });
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
}

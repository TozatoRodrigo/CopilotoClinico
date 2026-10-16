import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import {
  MENTORING_REQUEST_STATUSES,
  type MentoringAdminItem,
  type MentoringAdminMetrics,
  type MentoringAdminResponse,
  type MentoringRequestStatus,
} from '../../shared/contracts/clinical';
import type { MentoringAdminQuery } from './mentoring.schemas';

/** Linhas da tabela do painel; as métricas usam o período inteiro. */
const ADMIN_ITEMS_LIMIT = 200;

const ADMIN_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  claimedAt: true,
  answeredAt: true,
  cancelledAt: true,
  satisfaction: true,
  termsVersion: true,
  requesterId: true,
  requester: { select: { name: true } },
  mentor: { select: { name: true } },
  institution: { select: { name: true } },
} as const satisfies Prisma.MentoringRequestSelect;

type AdminRow = Prisma.MentoringRequestGetPayload<{ select: typeof ADMIN_SELECT }>;

function minutesBetween(from: Date, to: Date | null): number | null {
  return to ? Math.round((to.getTime() - from.getTime()) / 60_000) : null;
}

/** Percentil por posição mais próxima: com o volume do concierge, exato e legível. */
export function percentile(sortedAsc: readonly number[], fraction: number): number | null {
  if (sortedAsc.length === 0) return null;
  const index = Math.min(sortedAsc.length - 1, Math.ceil(fraction * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, index)] ?? null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeMentoring(
  rows: ReadonlyArray<
    Pick<AdminRow, 'status' | 'createdAt' | 'answeredAt' | 'satisfaction' | 'requesterId'>
  >,
  activePhysicians: number,
  periodDays: number,
): MentoringAdminMetrics {
  const byStatus = Object.fromEntries(MENTORING_REQUEST_STATUSES.map((s) => [s, 0])) as Record<
    MentoringRequestStatus,
    number
  >;
  for (const row of rows) byStatus[row.status] += 1;

  const responseTimes = rows
    .map((row) => minutesBetween(row.createdAt, row.answeredAt))
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b);

  const ratings = rows
    .map((row) => row.satisfaction)
    .filter((value): value is number => value !== null);
  const countOf = (rating: number) => ratings.filter((value) => value === rating).length;
  const distribution: MentoringAdminMetrics['satisfaction']['distribution'] = [
    countOf(1),
    countOf(2),
    countOf(3),
    countOf(4),
    countOf(5),
  ];

  return {
    periodDays,
    total: rows.length,
    byStatus,
    requesters: new Set(rows.map((row) => row.requesterId)).size,
    activePhysicians,
    requestsPerActivePhysician:
      activePhysicians > 0 ? round1(rows.length / activePhysicians) : null,
    responseMinutes: {
      median: percentile(responseTimes, 0.5),
      p90: percentile(responseTimes, 0.9),
    },
    satisfaction: {
      average:
        ratings.length > 0 ? round1(ratings.reduce((sum, r) => sum + r, 0) / ratings.length) : null,
      rated: ratings.length,
      distribution,
    },
  };
}

function toAdminItem(row: AdminRow): MentoringAdminItem {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    responseMinutes: minutesBetween(row.createdAt, row.answeredAt),
    satisfaction: row.satisfaction,
    requesterName: row.requester.name,
    mentorName: row.mentor?.name ?? null,
    institutionName: row.institution?.name ?? null,
    termsVersion: row.termsVersion,
  };
}

/**
 * CC-707 — painel da mentoria no console: pedidos, tempo de resposta e
 * satisfação, mais a métrica de sucesso (pedidos por médico ativo). Só
 * metadados: nenhum texto do caso, da dúvida ou da resposta.
 */
@Injectable()
export class MentoringAdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overview(query: MentoringAdminQuery): Promise<MentoringAdminResponse> {
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

    const [rows, activeEncounters] = await Promise.all([
      this.prisma.mentoringRequest.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: ADMIN_SELECT,
      }),
      // "Médico ativo" = ao menos uma análise do copiloto no período.
      this.prisma.encounter.findMany({
        where: { aiInteractions: { some: { createdAt: { gte: since } } } },
        distinct: ['physicianId'],
        select: { physicianId: true },
      }),
    ]);

    return {
      metrics: summarizeMentoring(rows, activeEncounters.length, query.days),
      items: rows.slice(0, ADMIN_ITEMS_LIMIT).map(toAdminItem),
    };
  }
}

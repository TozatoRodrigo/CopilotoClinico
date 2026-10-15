import type { KnowledgeGapGroupStatus } from '@prisma/client';
import { PS_SYNDROMES, type PsSyndrome } from '../../shared/contracts/clinical';
import type {
  KnowledgeGapQueueItem,
  KnowledgeGapSource,
  KnowledgeGapStatus,
} from '../../shared/contracts/knowledge-gaps';
import { gapPriority, severityOf } from './gap-severity';

/**
 * CC-409 — do banco à fila: estatística por grupo (contagem, fontes,
 * primeira e última ocorrência), consultas mais repetidas e notas recentes.
 * Funções puras, para a ordem e a forma da fila serem testadas sem banco.
 */

/** Consultas por item da fila: as mais repetidas. */
export const QUEUE_QUERIES_PER_ITEM = 5;
/** Notas por item da fila: as mais recentes. */
export const QUEUE_NOTES_PER_ITEM = 3;

export const GROUP_SELECT = {
  id: true,
  syndrome: true,
  topic: true,
  status: true,
  draftId: true,
  dismissReason: true,
  statusChangedAt: true,
  createdAt: true,
  coveredByCard: { select: { id: true, topic: true } },
} as const;

export interface GroupRow {
  id: string;
  syndrome: string | null;
  topic: string;
  status: KnowledgeGapGroupStatus;
  draftId: string | null;
  dismissReason: string | null;
  statusChangedAt: Date | null;
  createdAt: Date;
  coveredByCard: { id: string; topic: string } | null;
}

/** Uma linha do `groupBy(['groupId', 'source'])` das lacunas. */
export interface GroupSourceStatRow {
  groupId: string | null;
  source: KnowledgeGapSource;
  _count: { _all: number };
  _min: { createdAt: Date | null };
  _max: { createdAt: Date | null };
}

export interface GroupStats {
  occurrences: number;
  sources: Partial<Record<KnowledgeGapSource, number>>;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export function aggregateGroupStats(rows: readonly GroupSourceStatRow[]): Map<string, GroupStats> {
  const stats = new Map<string, GroupStats>();
  for (const row of rows) {
    const first = row._min.createdAt;
    const last = row._max.createdAt;
    if (!row.groupId || !first || !last) continue;
    const current = stats.get(row.groupId);
    if (!current) {
      stats.set(row.groupId, {
        occurrences: row._count._all,
        sources: { [row.source]: row._count._all },
        firstSeenAt: first,
        lastSeenAt: last,
      });
      continue;
    }
    current.occurrences += row._count._all;
    current.sources[row.source] = (current.sources[row.source] ?? 0) + row._count._all;
    if (first < current.firstSeenAt) current.firstSeenAt = first;
    if (last > current.lastSeenAt) current.lastSeenAt = last;
  }
  return stats;
}

export function asPsSyndrome(value: string | null): PsSyndrome | null {
  return value !== null && (PS_SYNDROMES as readonly string[]).includes(value)
    ? (value as PsSyndrome)
    : null;
}

/** A fila sem as consultas e as notas (que só a página carrega). */
export type BaseQueueItem = Omit<KnowledgeGapQueueItem, 'queries' | 'notes'>;

export function toBaseQueueItem(
  group: GroupRow,
  stats: GroupStats | undefined,
  occurrencesLast7Days: number,
): BaseQueueItem {
  const syndrome = asPsSyndrome(group.syndrome);
  const severity = severityOf(syndrome);
  const occurrences = stats?.occurrences ?? 0;
  const lastSeenAt = stats?.lastSeenAt ?? group.createdAt;
  const closed = group.status === 'covered' || group.status === 'dismissed';
  return {
    id: group.id,
    topic: group.topic,
    syndrome,
    severity,
    priority: gapPriority(occurrences, severity),
    status: group.status as KnowledgeGapStatus,
    occurrences,
    occurrencesLast7Days,
    sources: stats?.sources ?? {},
    firstSeenAt: (stats?.firstSeenAt ?? group.createdAt).toISOString(),
    lastSeenAt: lastSeenAt.toISOString(),
    draftId: group.draftId,
    coveredByCard: group.status === 'covered' ? group.coveredByCard : null,
    dismissReason: group.status === 'dismissed' ? group.dismissReason : null,
    statusChangedAt: group.statusChangedAt?.toISOString() ?? null,
    recurredAfterClose:
      closed && group.statusChangedAt !== null && lastSeenAt > group.statusChangedAt,
  };
}

export interface GapDetailRow {
  groupId: string | null;
  searchQueries: string[];
  note: string | null;
  createdAt: Date;
}

/**
 * Consultas mais repetidas do grupo (sem diferença de caixa e espaço); o
 * empate vai para a mais recente. `rows` vem da mais recente para a mais
 * antiga.
 */
export function topQueries(
  rows: readonly GapDetailRow[],
  limit = QUEUE_QUERIES_PER_ITEM,
): string[] {
  const counts = new Map<string, { query: string; count: number; order: number }>();
  let order = 0;
  for (const row of rows) {
    for (const query of row.searchQueries) {
      const trimmed = query.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { query: trimmed, count: 1, order: order++ });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.query);
}

/** Notas distintas, da mais recente para a mais antiga. */
export function recentNotes(rows: readonly GapDetailRow[], limit = QUEUE_NOTES_PER_ITEM): string[] {
  const notes: string[] = [];
  for (const row of rows) {
    const note = row.note?.trim();
    if (note && !notes.includes(note)) notes.push(note);
    if (notes.length === limit) break;
  }
  return notes;
}

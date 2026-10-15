import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/config/prisma.service';

/**
 * CC-409 — banco em memória para as lacunas e os grupos: o suficiente das
 * consultas do Prisma que `KnowledgeGapsService` e `KnowledgeGapQueueService`
 * fazem para testar agrupamento, ordem e fechamento sem Postgres. O
 * comportamento do banco de verdade (GRANT, cascata, CHECK) está no teste de
 * integração da CC-409.
 */

export interface StoredGap {
  id: string;
  source: 'physician_not_found' | 'decision_no_card' | 'quick_question';
  interactionId: string | null;
  syndrome: string | null;
  searchQueries: string[];
  note: string | null;
  groupId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredGroup {
  id: string;
  syndrome: string | null;
  signature: string[];
  topic: string;
  status: 'open' | 'drafting' | 'covered' | 'dismissed';
  draftId: string | null;
  coveredByCardId: string | null;
  dismissReason: string | null;
  statusChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredCard {
  id: string;
  topic: string;
  syndrome: string | null;
  institutionId: string | null;
  status: 'draft' | 'in_review' | 'published' | 'archived';
  question: string;
  draftIds: string[];
}

type Range = { gte?: Date; lt?: Date };
type Where = Record<string, unknown>;

function inRange(value: Date | null, range: Range): boolean {
  if (value === null) return false;
  if (range.gte && value < range.gte) return false;
  if (range.lt && value >= range.lt) return false;
  return true;
}

function matchesScalar(value: unknown, condition: unknown): boolean {
  if (condition === undefined) return true;
  if (condition === null) return value === null;
  if (condition instanceof Date)
    return value instanceof Date && value.getTime() === condition.getTime();
  if (typeof condition === 'object') {
    const c = condition as Record<string, unknown>;
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('not' in c) return c.not === null ? value !== null : value !== c.not;
    if ('gte' in c || 'lt' in c) return inRange(value as Date | null, c as Range);
  }
  return value === condition;
}

function pick<T extends object>(row: T, select?: Record<string, unknown>): Partial<T> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) out[key] = (row as Record<string, unknown>)[key];
  return out as Partial<T>;
}

export function createGapStore(now: () => Date = () => new Date()) {
  const gaps: StoredGap[] = [];
  const groups: StoredGroup[] = [];
  const cards: StoredCard[] = [];
  /** Análise → atendimento, para a deduplicação por atendimento. */
  const encounterOf = new Map<string, string>();
  const locks: unknown[] = [];

  function gapMatches(gap: StoredGap, where: Where = {}): boolean {
    for (const [key, condition] of Object.entries(where)) {
      if (key === 'interaction') {
        const encounterId = (condition as { encounterId: string }).encounterId;
        if (!gap.interactionId || encounterOf.get(gap.interactionId) !== encounterId) return false;
        continue;
      }
      if (!matchesScalar((gap as unknown as Record<string, unknown>)[key], condition)) return false;
    }
    return true;
  }

  function groupMatches(group: StoredGroup, where: Where = {}): boolean {
    for (const [key, condition] of Object.entries(where)) {
      if (key === 'OR') {
        if (!(condition as Where[]).some((alt) => groupMatches(group, alt))) return false;
        continue;
      }
      if (key === 'gaps') {
        if (gaps.some((gap) => gap.groupId === group.id)) return false;
        continue;
      }
      if (!matchesScalar((group as unknown as Record<string, unknown>)[key], condition))
        return false;
    }
    return true;
  }

  function withCard(group: StoredGroup) {
    const card = cards.find((c) => c.id === group.coveredByCardId);
    return { ...group, coveredByCard: card ? { id: card.id, topic: card.topic } : null };
  }

  const prisma = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(values[0]);
      return 1;
    },
    knowledgeGap: {
      findUnique: async ({
        where,
      }: {
        where: { interactionId_source: { interactionId: string; source: string } };
      }) => {
        const { interactionId, source } = where.interactionId_source;
        const gap = gaps.find((g) => g.interactionId === interactionId && g.source === source);
        return gap ? { id: gap.id, groupId: gap.groupId } : null;
      },
      findFirst: async ({ where }: { where: Where }) => {
        const gap = gaps.find((g) => gapMatches(g, where));
        return gap ? { id: gap.id } : null;
      },
      findMany: async ({
        where,
        take,
        orderBy,
      }: {
        where?: Where;
        take?: number;
        orderBy?: unknown;
      }) => {
        const rows = gaps.filter((g) => gapMatches(g, where));
        const desc = JSON.stringify(orderBy ?? '').includes('desc');
        rows.sort((a, b) =>
          desc
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
        return rows.slice(0, take ?? rows.length).map((g) => ({ ...g }));
      },
      create: async ({ data }: { data: Partial<StoredGap> }) => {
        const gap: StoredGap = {
          id: randomUUID(),
          source: data.source as StoredGap['source'],
          interactionId: data.interactionId ?? null,
          syndrome: data.syndrome ?? null,
          searchQueries: [...(data.searchQueries ?? [])],
          note: data.note ?? null,
          groupId: data.groupId ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        gaps.push(gap);
        return { id: gap.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<StoredGap> }) => {
        const gap = gaps.find((g) => g.id === where.id);
        if (!gap) throw new Error('lacuna inexistente');
        Object.assign(gap, data, { updatedAt: now() });
        return { id: gap.id };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const doomed = gaps.filter((g) => gapMatches(g, where));
        for (const gap of doomed) gaps.splice(gaps.indexOf(gap), 1);
        return { count: doomed.length };
      },
      groupBy: async ({ by, where }: { by: Array<'groupId' | 'source'>; where?: Where }) => {
        const buckets = new Map<string, StoredGap[]>();
        for (const gap of gaps.filter((g) => gapMatches(g, where))) {
          const key = by.map((field) => String(gap[field])).join('|');
          buckets.set(key, [...(buckets.get(key) ?? []), gap]);
        }
        return [...buckets.values()].map((rows) => {
          const first = rows[0] as StoredGap;
          const times = rows.map((row) => row.createdAt.getTime());
          return {
            ...Object.fromEntries(by.map((field) => [field, first[field]])),
            _count: { _all: rows.length },
            _min: { createdAt: new Date(Math.min(...times)) },
            _max: { createdAt: new Date(Math.max(...times)) },
          };
        });
      },
    },
    knowledgeGapGroup: {
      findMany: async ({ where, select }: { where?: Where; select?: Record<string, unknown> }) =>
        groups.filter((g) => groupMatches(g, where)).map((g) => pick(withCard(g), select)),
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, unknown>;
      }) => {
        const group = groups.find((g) => g.id === where.id);
        return group ? pick(withCard(group), select) : null;
      },
      count: async ({ where }: { where?: Where }) =>
        groups.filter((g) => groupMatches(g, where)).length,
      create: async ({ data }: { data: Partial<StoredGroup> }) => {
        const group: StoredGroup = {
          id: randomUUID(),
          syndrome: data.syndrome ?? null,
          signature: [...(data.signature ?? [])],
          topic: data.topic ?? '',
          status: 'open',
          draftId: null,
          coveredByCardId: null,
          dismissReason: null,
          statusChangedAt: null,
          createdAt: now(),
          updatedAt: now(),
        };
        groups.push(group);
        return { id: group.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<StoredGroup> }) => {
        const group = groups.find((g) => g.id === where.id);
        if (!group) throw new Error('grupo inexistente');
        Object.assign(group, data, { updatedAt: now() });
        return { id: group.id };
      },
      updateMany: async ({ where, data }: { where: Where; data: Partial<StoredGroup> }) => {
        const hits = groups.filter((g) => groupMatches(g, where));
        for (const group of hits) Object.assign(group, data, { updatedAt: now() });
        return { count: hits.length };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const doomed = groups.filter((g) => groupMatches(g, where));
        for (const group of doomed) groups.splice(groups.indexOf(group), 1);
        return { count: doomed.length };
      },
    },
    knowledgeCard: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const card = cards.find((c) => c.id === where.id);
        if (!card) return null;
        return {
          id: card.id,
          topic: card.topic,
          syndrome: card.syndrome,
          institutionId: card.institutionId,
          status: card.status,
          publishedVersion:
            card.status === 'published' ? { content: { question: card.question } } : null,
          versions: card.draftIds.length
            ? card.draftIds.map((draftId) => ({ draftId }))
            : [{ draftId: null }],
        };
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    gaps,
    groups,
    cards,
    locks,
    /** Liga a análise ao atendimento (o que o `interaction: { encounterId }` do Prisma lê). */
    linkInteraction(interactionId: string, encounterId: string) {
      encounterOf.set(interactionId, encounterId);
    },
  };
}

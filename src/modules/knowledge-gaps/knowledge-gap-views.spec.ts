import { describe, expect, it } from 'vitest';
import {
  aggregateGroupStats,
  recentNotes,
  toBaseQueueItem,
  topQueries,
  type GapDetailRow,
  type GroupRow,
} from './knowledge-gap-views';

const at = (iso: string) => new Date(iso);

function row(searchQueries: string[], note: string | null = null): GapDetailRow {
  return { groupId: 'g-1', searchQueries, note, createdAt: at('2026-10-15T10:00:00.000Z') };
}

function group(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    id: 'g-1',
    syndrome: 'febre',
    topic: 'dengue sinais de alarme',
    status: 'open',
    draftId: null,
    dismissReason: null,
    statusChangedAt: null,
    createdAt: at('2026-10-01T10:00:00.000Z'),
    coveredByCard: null,
    ...overrides,
  };
}

describe('visões da fila de lacunas (CC-409)', () => {
  it('soma as fontes de cada grupo e guarda a primeira e a última ocorrência', () => {
    const stats = aggregateGroupStats([
      {
        groupId: 'g-1',
        source: 'quick_question',
        _count: { _all: 2 },
        _min: { createdAt: at('2026-10-10T00:00:00.000Z') },
        _max: { createdAt: at('2026-10-12T00:00:00.000Z') },
      },
      {
        groupId: 'g-1',
        source: 'decision_no_card',
        _count: { _all: 3 },
        _min: { createdAt: at('2026-10-05T00:00:00.000Z') },
        _max: { createdAt: at('2026-10-11T00:00:00.000Z') },
      },
      {
        groupId: null,
        source: 'quick_question',
        _count: { _all: 9 },
        _min: { createdAt: at('2026-10-01T00:00:00.000Z') },
        _max: { createdAt: at('2026-10-01T00:00:00.000Z') },
      },
    ]);

    expect([...stats.keys()]).toEqual(['g-1']);
    expect(stats.get('g-1')).toEqual({
      occurrences: 5,
      sources: { quick_question: 2, decision_no_card: 3 },
      firstSeenAt: at('2026-10-05T00:00:00.000Z'),
      lastSeenAt: at('2026-10-12T00:00:00.000Z'),
    });
  });

  it('consultas mais repetidas primeiro, sem diferença de caixa e espaço; notas distintas e recentes', () => {
    const rows = [
      row(['Hidratação  na dengue', 'plaquetas dengue'], 'Faltou a dose por peso'),
      row(['hidratação na dengue'], 'Faltou a dose por peso'),
      row(['sinais de alarme'], 'Quando internar'),
    ];

    expect(topQueries(rows)).toEqual([
      'Hidratação  na dengue',
      'plaquetas dengue',
      'sinais de alarme',
    ]);
    expect(recentNotes(rows)).toEqual(['Faltou a dose por peso', 'Quando internar']);
  });

  it('mostra o cartão só da lacuna coberta e marca a que voltou a aparecer depois de fechada', () => {
    const covered = group({
      status: 'covered',
      coveredByCard: { id: 'card-1', topic: 'Dengue' },
      statusChangedAt: at('2026-10-10T00:00:00.000Z'),
    });
    const stats = {
      occurrences: 2,
      sources: { decision_no_card: 2 },
      firstSeenAt: at('2026-10-05T00:00:00.000Z'),
      lastSeenAt: at('2026-10-12T00:00:00.000Z'),
    };

    expect(toBaseQueueItem(covered, stats, 1)).toMatchObject({
      coveredByCard: { id: 'card-1', topic: 'Dengue' },
      recurredAfterClose: true,
      severity: 'urgent',
      priority: 4,
    });
    expect(toBaseQueueItem({ ...covered, status: 'open' }, stats, 1)).toMatchObject({
      coveredByCard: null,
      recurredAfterClose: false,
    });
  });
});

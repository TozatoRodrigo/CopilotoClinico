import { describe, expect, it } from 'vitest';
import { PS_SYNDROMES } from '../../shared/contracts/clinical';
import { compareByPriority, gapPriority, severityOf, SYNDROME_SEVERITY } from './gap-severity';

const at = (iso: string) => new Date(iso);

describe('gravidade e ordem da fila (CC-409)', () => {
  it('toda síndrome de PS tem gravidade; sem síndrome é comum', () => {
    expect(Object.keys(SYNDROME_SEVERITY).sort()).toEqual([...PS_SYNDROMES].sort());
    expect(severityOf(null)).toBe('common');
    expect(severityOf('choque')).toBe('time_critical');
    expect(severityOf('vertigem')).toBe('common');
  });

  it('prioridade é ocorrências × peso: 2 tempo-críticas passam 5 comuns', () => {
    expect(gapPriority(2, 'time_critical')).toBe(6);
    expect(gapPriority(5, 'common')).toBe(5);
    expect(gapPriority(3, 'urgent')).toBe(6);
  });

  it('ordena por prioridade, depois gravidade, depois a mais recente, depois o id', () => {
    const groups = [
      { id: 'd', priority: 5, severity: 'common' as const, lastSeenAt: at('2026-10-14') },
      { id: 'c', priority: 6, severity: 'urgent' as const, lastSeenAt: at('2026-10-15') },
      { id: 'b', priority: 6, severity: 'time_critical' as const, lastSeenAt: at('2026-10-01') },
      { id: 'a2', priority: 5, severity: 'common' as const, lastSeenAt: at('2026-10-14') },
      { id: 'e', priority: 5, severity: 'common' as const, lastSeenAt: at('2026-10-15') },
    ];

    expect([...groups].sort(compareByPriority).map((group) => group.id)).toEqual([
      'b',
      'c',
      'e',
      'a2',
      'd',
    ]);
  });
});

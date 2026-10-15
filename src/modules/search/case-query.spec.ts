import { describe, expect, it } from 'vitest';
import { parseCaseQuery } from './case-query';

/** 15/10/2026, 10h em Brasília. */
const NOW = new Date('2026-10-15T13:00:00.000Z');

function day(iso: string): { from: Date; to: Date } {
  const from = new Date(`${iso}T00:00:00-03:00`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

describe('parseCaseQuery — o que a busca de casos entende (CC-502)', () => {
  it.each([
    ['12/10', '2026-10-12'],
    ['12/10/2026', '2026-10-12'],
    ['3-9-26', '2026-09-03'],
    ['2026-10-01', '2026-10-01'],
    ['hoje', '2026-10-15'],
    ['Ontem', '2026-10-14'],
    ['anteontem', '2026-10-13'],
  ])('"%s" é o dia %s em Brasília', (query, iso) => {
    expect(parseCaseQuery(query, NOW)).toEqual({ day: day(iso), text: '' });
  });

  it('sem ano, a data no futuro é do ano passado', () => {
    expect(parseCaseQuery('24/12', NOW).day).toEqual(day('2025-12-24'));
  });

  it('o dia segue Brasília perto da meia-noite UTC', () => {
    // 01h UTC do dia 16 ainda é 22h do dia 15 em Brasília.
    expect(parseCaseQuery('hoje', new Date('2026-10-16T01:00:00.000Z')).day).toEqual(
      day('2026-10-15'),
    );
  });

  it('separa a data do resto da busca', () => {
    expect(parseCaseQuery('dor torácica ontem', NOW)).toEqual({
      day: day('2026-10-14'),
      text: 'dor torácica',
    });
    expect(parseCaseQuery('leito 4 12/10', NOW)).toEqual({
      day: day('2026-10-12'),
      text: 'leito 4',
    });
  });

  it.each(['31/02', '45/10', '12/13/2026', '0.5', 'noradrenalina 0,1', 'leito 12'])(
    '"%s" não é data: fica no texto',
    (query) => {
      expect(parseCaseQuery(query, NOW)).toEqual({ day: null, text: query });
    },
  );
});

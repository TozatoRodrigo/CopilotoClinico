import { describe, expect, it } from 'vitest';
import { formatPeriodStart, reviewPeriodStart, reviewWindow } from './review-period';

describe('reviewPeriodStart', () => {
  it.each([
    ['segunda de manhã', '2026-10-12T13:00:00Z', '2026-10-12'],
    ['quarta-feira', '2026-10-14T18:00:00Z', '2026-10-12'],
    ['domingo à noite em Brasília', '2026-10-19T02:30:00Z', '2026-10-12'],
    ['segunda 00:30 em Brasília', '2026-10-19T03:30:00Z', '2026-10-19'],
    ['virada de mês', '2026-11-01T15:00:00Z', '2026-10-26'],
    ['virada de ano', '2027-01-01T12:00:00Z', '2026-12-28'],
  ])('%s → segunda-feira da semana em Brasília', (_label, now, expected) => {
    expect(formatPeriodStart(reviewPeriodStart(new Date(now)))).toBe(expected);
  });

  it('returns UTC midnight, the way Prisma stores a date column', () => {
    expect(reviewPeriodStart(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe(
      '2026-10-12T00:00:00.000Z',
    );
  });
});

describe('reviewWindow', () => {
  it('covers the 7 days before the request', () => {
    const now = new Date('2026-10-15T12:00:00Z');

    expect(reviewWindow(now)).toEqual({ start: new Date('2026-10-08T12:00:00Z'), end: now });
  });
});

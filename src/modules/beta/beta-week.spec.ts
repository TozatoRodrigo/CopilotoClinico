import { describe, expect, it } from 'vitest';
import {
  addDays,
  FutureBetaWeekError,
  localDateOf,
  mondayOf,
  resolveBetaWeek,
  startOfLocalDay,
  toWeekRange,
} from './beta-week';

const iso = (date: Date) => date.toISOString();

describe('semana do painel do beta (CC-705)', () => {
  describe('calendário de Brasília', () => {
    it('starts the day at midnight in Brasília, 03:00 UTC', () => {
      expect(iso(startOfLocalDay('2026-10-12'))).toBe('2026-10-12T03:00:00.000Z');
    });

    it('follows the named time zone, not a fixed -03:00 (horário de verão de 2018)', () => {
      expect(iso(startOfLocalDay('2018-12-03'))).toBe('2018-12-03T02:00:00.000Z');
    });

    it('reads the local date of an instant on the Brasília clock', () => {
      // Domingo 23:30 em Brasília já é segunda em UTC.
      expect(localDateOf(new Date('2026-10-19T02:30:00.000Z'))).toBe('2026-10-18');
      expect(localDateOf(new Date('2026-10-19T03:00:00.000Z'))).toBe('2026-10-19');
    });

    it('finds the Monday of any day, across month and year', () => {
      expect(mondayOf('2026-10-12')).toBe('2026-10-12');
      expect(mondayOf('2026-10-18')).toBe('2026-10-12');
      expect(mondayOf('2027-01-01')).toBe('2026-12-28');
      expect(addDays('2026-12-28', 6)).toBe('2027-01-03');
    });
  });

  describe('resolveBetaWeek', () => {
    it('measures the current week until now and cuts the previous one at the same point', () => {
      // Sexta 16/10/2026, 13:00 em Brasília: a hora da reunião (CC-706).
      const now = new Date('2026-10-16T16:00:00.000Z');
      const week = resolveBetaWeek(undefined, now);

      expect(week.inProgress).toBe(true);
      expect(toWeekRange(week.current)).toEqual({
        weekStart: '2026-10-12',
        weekEnd: '2026-10-18',
        from: '2026-10-12T03:00:00.000Z',
        to: '2026-10-16T16:00:00.000Z',
      });
      expect(toWeekRange(week.previous)).toEqual({
        weekStart: '2026-10-05',
        weekEnd: '2026-10-11',
        from: '2026-10-05T03:00:00.000Z',
        to: '2026-10-09T16:00:00.000Z',
      });
    });

    it('keeps Sunday 23:30 in Brasília in the week that is ending', () => {
      const week = resolveBetaWeek(undefined, new Date('2026-10-19T02:30:00.000Z'));
      expect(week.current.weekStart).toBe('2026-10-12');
      expect(week.inProgress).toBe(true);
    });

    it('opens the new week at Monday 00:00 in Brasília', () => {
      const week = resolveBetaWeek(undefined, new Date('2026-10-19T03:00:00.000Z'));
      expect(week.current.weekStart).toBe('2026-10-19');
      expect(iso(week.current.from)).toBe('2026-10-19T03:00:00.000Z');
      expect(iso(week.previous.to)).toBe('2026-10-12T03:00:00.000Z');
    });

    it('compares a closed week with the whole previous week', () => {
      const week = resolveBetaWeek('2026-10-07', new Date('2026-10-16T16:00:00.000Z'));

      expect(week.inProgress).toBe(false);
      expect(toWeekRange(week.current)).toEqual({
        weekStart: '2026-10-05',
        weekEnd: '2026-10-11',
        from: '2026-10-05T03:00:00.000Z',
        to: '2026-10-12T03:00:00.000Z',
      });
      expect(toWeekRange(week.previous)).toEqual({
        weekStart: '2026-09-28',
        weekEnd: '2026-10-04',
        from: '2026-09-28T03:00:00.000Z',
        to: '2026-10-05T03:00:00.000Z',
      });
    });

    it('refuses a week that has not started yet', () => {
      expect(() => resolveBetaWeek('2026-10-19', new Date('2026-10-16T16:00:00.000Z'))).toThrow(
        FutureBetaWeekError,
      );
    });
  });
});

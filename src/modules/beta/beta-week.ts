import { BETA_WEEK_TIME_ZONE, type BetaWeekRange } from '../../shared/contracts/beta-weekly';

/** Janela medida: `[from, to)`, em instantes UTC. */
export interface WeekWindow {
  from: Date;
  to: Date;
}

export interface ResolvedBetaWeek {
  current: WeekWindow & { weekStart: string; weekEnd: string };
  previous: WeekWindow & { weekStart: string; weekEnd: string };
  inProgress: boolean;
}

/** Semana pedida depois do momento atual: não há o que medir. */
export class FutureBetaWeekError extends Error {
  constructor(readonly weekStart: string) {
    super(`A semana de ${weekStart} ainda não começou`);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const localDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BETA_WEEK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const localPartsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: BETA_WEEK_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function parseDate(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year!, month!, day!];
}

/** Data de calendário (`YYYY-MM-DD`) somada de `days`, sem passar por fuso. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Data local de Brasília de um instante. */
export function localDateOf(instant: Date): string {
  // `en-CA` formata como ISO (`2026-10-12`).
  return localDateFormat.format(instant);
}

/** Segunda-feira da semana de uma data de calendário. */
export function mondayOf(date: string): string {
  const [year, month, day] = parseDate(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = domingo
  return addDays(date, -((weekday + 6) % 7));
}

/** Quanto o relógio de Brasília está à frente do UTC num instante (negativo: -3 h). */
function offsetAt(instant: number): number {
  const parts = Object.fromEntries(
    localPartsFormat
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Instante da meia-noite de uma data em Brasília. Pelo fuso nomeado, não por
 * -03:00 fixo: se o horário de verão voltar, a semana continua começando à
 * meia-noite do relógio local.
 */
export function startOfLocalDay(date: string): Date {
  const [year, month, day] = parseDate(date);
  const wallClock = Date.UTC(year, month - 1, day);
  const firstGuess = wallClock - offsetAt(wallClock);
  return new Date(wallClock - offsetAt(firstGuess));
}

function rangeOf(weekStart: string, window: WeekWindow): ResolvedBetaWeek['current'] {
  return { weekStart, weekEnd: addDays(weekStart, 6), ...window };
}

/**
 * CC-705 — a semana do painel (segunda a domingo, horário de Brasília) e a
 * anterior. Sem `requested`, a semana corrente. Qualquer data serve: vale a
 * semana que a contém.
 *
 * Semana corrente é medida até `now`, e a anterior é cortada no mesmo ponto
 * (mesmo tempo decorrido desde a segunda 00:00): na sexta 13h, segunda a
 * sexta 13h contra segunda a sexta 13h.
 */
export function resolveBetaWeek(requested: string | undefined, now: Date): ResolvedBetaWeek {
  const weekStart = mondayOf(requested ?? localDateOf(now));
  const from = startOfLocalDay(weekStart);
  if (from.getTime() > now.getTime()) throw new FutureBetaWeekError(weekStart);

  const weekEndExclusive = startOfLocalDay(addDays(weekStart, 7));
  const inProgress = now.getTime() < weekEndExclusive.getTime();
  const to = inProgress ? now : weekEndExclusive;

  const previousStart = addDays(weekStart, -7);
  const previousFrom = startOfLocalDay(previousStart);
  const previousTo = inProgress
    ? new Date(previousFrom.getTime() + (to.getTime() - from.getTime()))
    : from;

  return {
    current: rangeOf(weekStart, { from, to }),
    previous: rangeOf(previousStart, { from: previousFrom, to: previousTo }),
    inProgress,
  };
}

export function toWeekRange(range: ResolvedBetaWeek['current']): BetaWeekRange {
  return {
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };
}

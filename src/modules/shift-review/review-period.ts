import { REVIEW_WINDOW_DAYS } from './shift-review.settings';

/** A semana da revisão vira na segunda-feira do horário de Brasília, não na de UTC. */
export const REVIEW_TIME_ZONE = 'America/Sao_Paulo';

const DAY_MS = 24 * 60 * 60 * 1000;

const LOCAL_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: REVIEW_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function localDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(
    LOCAL_DATE.formatToParts(now).map(({ type, value }) => [type, Number(value)]),
  );
  return { year: parts.year!, month: parts.month!, day: parts.day! };
}

/**
 * Segunda-feira da semana de `now` no horário de Brasília, como meia-noite
 * UTC — a forma em que o Prisma grava e compara uma coluna `@db.Date`.
 */
export function reviewPeriodStart(now: Date): Date {
  const { year, month, day } = localDateParts(now);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date;
}

/** `YYYY-MM-DD` da coluna `period_start`. */
export function formatPeriodStart(periodStart: Date): string {
  return periodStart.toISOString().slice(0, 10);
}

/** As análises que entram numa revisão pedida em `now`: os 7 dias anteriores. */
export function reviewWindow(now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getTime() - REVIEW_WINDOW_DAYS * DAY_MS), end: now };
}

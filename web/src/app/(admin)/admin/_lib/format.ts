/** Formatação de datas do console (pt-BR). */

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/** "há 35 minutos", "há 4 horas", "ontem", "há 3 dias". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Math.abs(diffMin) < 1) return 'agora';
  if (Math.abs(diffMin) < 60) return relative.format(diffMin, 'minute');
  const diffHours = Math.round(diffMin / 60);
  if (Math.abs(diffHours) < 24) return relative.format(diffHours, 'hour');
  return relative.format(Math.round(diffHours / 24), 'day');
}

/** "10/10/2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "2026-10-09" → "09/10" sem passar por Date (evita deslocar o dia pelo fuso). */
export function formatDay(date: string): string {
  const [, month, day] = date.split('-');
  return month && day ? `${day}/${month}` : date;
}

/** Ciclo de revisão das fontes de diretriz (KB-002). */
export const REVIEW_CYCLE_MONTHS = 6;

/** Fonte ativa há mais de `REVIEW_CYCLE_MONTHS` meses sem nova versão. */
export function isReviewOverdue(validFrom: string): boolean {
  const reviewDate = new Date(validFrom);
  reviewDate.setMonth(reviewDate.getMonth() + REVIEW_CYCLE_MONTHS);
  return reviewDate < new Date();
}

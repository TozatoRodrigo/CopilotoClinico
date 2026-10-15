import {
  requireValue,
  type EvaluationContext,
  type InputIssue,
  type NumericInput,
} from '../calculator';

/**
 * Data da última menstruação (DUM), usada pela DPP e pela idade gestacional.
 * No ANY eram três campos numéricos (dia, mês, ano) e a conta somava
 * milissegundos no fuso local; aqui a conta é por dia de calendário (sem
 * horário de verão no meio), o que dá o mesmo resultado no Brasil.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Os três campos da DUM, com as faixas do ANY. */
export const DUM_INPUTS: readonly NumericInput[] = [
  { id: 'dum_day', label: 'Dia da DUM', unit: '', min: 1, max: 31, step: 1 },
  { id: 'dum_month', label: 'Mês da DUM', unit: '', min: 1, max: 12, step: 1 },
  { id: 'dum_year', label: 'Ano da DUM', unit: '', min: 2020, max: 2030, step: 1 },
];

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function dumOf(values: Readonly<Record<string, number>>): CalendarDate {
  return {
    year: requireValue(values, 'dum_year'),
    month: requireValue(values, 'dum_month'),
    day: requireValue(values, 'dum_day'),
  };
}

/** Dia de calendário como número de dias desde 01/01/1970 (sem fuso). */
function epochDay({ year, month, day }: CalendarDate): number {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function todayOf(context: EvaluationContext): CalendarDate {
  const { today } = context;
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "dd/mm/aaaa" de um dia contado desde 01/01/1970. */
export function formatEpochDay(days: number): string {
  const date = new Date(days * DAY_MS);
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/**
 * 31/02 não existe e DUM no futuro não tem idade gestacional. O ANY
 * rolava 31/02 para março sem avisar e mostrava "DUM no futuro" como
 * resultado; aqui os dois casos não calculam e dizem o que conferir.
 */
export function checkDum(
  values: Readonly<Record<string, number>>,
  context: EvaluationContext,
): InputIssue | null {
  const dum = dumOf(values);
  const date = new Date(Date.UTC(dum.year, dum.month - 1, dum.day));
  if (date.getUTCDate() !== dum.day || date.getUTCMonth() !== dum.month - 1) {
    return {
      inputId: 'dum_day',
      message: `A data ${pad(dum.day)}/${pad(dum.month)}/${dum.year} não existe. Confira o dia e o mês.`,
    };
  }
  if (gestationalDays(values, context) < 0) {
    return { inputId: 'dum_day', message: 'A DUM está no futuro. Verifique a data informada.' };
  }
  return null;
}

/** Dias desde a DUM até hoje (idade gestacional em dias). */
export function gestationalDays(
  values: Readonly<Record<string, number>>,
  context: EvaluationContext,
): number {
  return epochDay(todayOf(context)) - epochDay(dumOf(values));
}

/** Data provável do parto pela regra de Naegele (DUM + 280 dias), em dias desde 1970. */
export function naegeleDueDate(values: Readonly<Record<string, number>>): number {
  return epochDay(dumOf(values)) + 280;
}

/** "12 semanas e 3 dias". */
export function formatGestationalAge(days: number): string {
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'} e ${rest} ${rest === 1 ? 'dia' : 'dias'}`;
}

/** Trimestre pela idade gestacional, com os cortes do ANY (14 e 28 semanas). */
export function trimesterOf(days: number): string {
  const weeks = Math.floor(days / 7);
  if (weeks >= 28) return 'terceiro trimestre';
  if (weeks >= 14) return 'segundo trimestre';
  return 'primeiro trimestre';
}

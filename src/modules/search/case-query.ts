/**
 * CC-502 — o que a busca do ⌘K entende de um caso: a data em que foi aberto
 * e o resto, que vira rótulo (`patientRef`) ou síndrome. Texto clínico não
 * entra: a busca de casos nunca olha o relato.
 */

/** O plantão é no horário de Brasília (sem horário de verão desde 2019). */
const BRASILIA_OFFSET = '-03:00';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayRange {
  /** Início do dia em Brasília, inclusive. */
  from: Date;
  /** Início do dia seguinte, exclusive. */
  to: Date;
}

export interface CaseQuery {
  day: DayRange | null;
  /** O que sobrou depois de tirar a data. */
  text: string;
}

/**
 * "dd/mm", "dd/mm/aa", "dd/mm/aaaa" (também com "-"), ou ISO "aaaa-mm-dd".
 * Ponto não separa data: "0.5" é dose.
 */
const DAY_MONTH = /(?:^|\s)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?(?=\s|$)/;
const ISO_DATE = /(?:^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/;
const RELATIVE_DAY = /(?:^|\s)(hoje|ontem|anteontem)(?=\s|$)/i;
const DAYS_AGO: Record<string, number> = { hoje: 0, ontem: 1, anteontem: 2 };

/** Ano, mês e dia de hoje em Brasília. */
function todayInBrasilia(now: Date): { year: number; month: number; day: number } {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);
  return { year: year!, month: month!, day: day! };
}

/** O dia inteiro em Brasília, ou `null` quando a data não existe (31/02). */
function dayRange(year: number, month: number, day: number): DayRange | null {
  const from = new Date(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00${BRASILIA_OFFSET}`,
  );
  if (Number.isNaN(from.getTime())) return null;
  // `Date` aceita 31/02 e passa para março: confere que o dia continua o mesmo.
  const check = todayInBrasilia(from);
  if (check.year !== year || check.month !== month || check.day !== day) return null;
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

function withoutMatch(text: string, match: RegExpExecArray): string {
  return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Separa a data do resto da busca. Sem ano, vale a ocorrência mais recente
 * que não está no futuro ("12/10" em janeiro é outubro do ano passado). Data
 * que não existe não é data: fica no texto.
 */
export function parseCaseQuery(query: string, now: Date): CaseQuery {
  const text = query.replace(/\s+/g, ' ').trim();
  const today = todayInBrasilia(now);

  const relative = RELATIVE_DAY.exec(text);
  if (relative) {
    const base = dayRange(today.year, today.month, today.day)!;
    const from = new Date(base.from.getTime() - DAYS_AGO[relative[1]!.toLowerCase()]! * DAY_MS);
    return {
      day: { from, to: new Date(from.getTime() + DAY_MS) },
      text: withoutMatch(text, relative),
    };
  }

  const iso = ISO_DATE.exec(text);
  if (iso) {
    const day = dayRange(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (day) return { day, text: withoutMatch(text, iso) };
  }

  const dayMonth = DAY_MONTH.exec(text);
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = Number(dayMonth[2]);
    const yearText = dayMonth[3];
    let range: DayRange | null;
    if (yearText) {
      range = dayRange(
        yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText),
        month,
        day,
      );
    } else {
      range = dayRange(today.year, month, day);
      if (range && range.from.getTime() > now.getTime())
        range = dayRange(today.year - 1, month, day);
    }
    if (range) return { day: range, text: withoutMatch(text, dayMonth) };
  }

  return { day: null, text };
}

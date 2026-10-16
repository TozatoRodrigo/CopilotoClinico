import { stripAccents } from './text';
import type { VocabularyEntry, VocabularyKind } from './vocabulary';

/**
 * CC-205 — o que o WER não vê: um número ou um nome de droga trocado vale
 * mais que dez palavras de ligação. Aqui "cento e vinte por oitenta" e
 * "120x80" são os mesmos dois números, e "0,5 miligrama" é "0,5 mg"; mas
 * "0,5 mg" e "0,5 mcg" não são a mesma dose.
 */

/** Minúsculas, sem acento, µ → mc e "38,5°C" → "38,5 graus", em tokens. */
export function clinicalTokens(text: string): string[] {
  const normalized = stripAccents(text.normalize('NFC').toLowerCase())
    .replace(/[µμ]/g, 'mc')
    .replace(/(\d)\s*°\s*c?(?![a-z])/g, '$1 graus ')
    // "º" também é ordinal ("1º dia"): só vira grau com o C.
    .replace(/(\d)\s*º\s*c(?![a-z])/g, '$1 graus ')
    .replace(/(\d)\s*x\s*(?=\d)/g, '$1 x ');
  return normalized.match(/\d+(?:[.,]\d+)*|[a-z][a-z0-9]*|[/%]/g) ?? [];
}

const SPELLED_NUMBERS: Readonly<Record<string, number>> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};
const HALF = new Set(['meio', 'meia']);
/** "um paciente", "meia hora": só contam como número antes de uma unidade. */
const AMBIGUOUS_ALONE = new Set(['um', 'uma', 'meio', 'meia']);

function spelled(token: string | undefined): number | undefined {
  return token === undefined ? undefined : SPELLED_NUMBERS[token];
}

function isNumberToken(token: string): boolean {
  return /^\d/.test(token) || token in SPELLED_NUMBERS || token === 'mil';
}

/** pt-BR: ponto seguido de 3 dígitos é milhar ("1.000"); vírgula é decimal. */
function parseDigits(token: string): number | null {
  const withoutThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)
    ? token.replace(/\./g, '')
    : token;
  const value = Number(withoutThousands.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** "cento e vinte" junta; "vinte e quinze" e "três quatro" são dois números. */
function joins(group: number, next: number): boolean {
  if (group === 0) return true;
  const magnitude = next < 10 ? 10 : next < 100 ? 100 : 1000;
  return group > next && group % magnitude === 0;
}

interface NumberRead {
  value: number;
  /** Índice do primeiro token depois do número. */
  end: number;
  ambiguous: boolean;
}

/** Parte depois de "vírgula": "cinco" → 0,5; "zero cinco" → 0,05; "vinte e cinco" → 0,25. */
function readFraction(tokens: readonly string[], start: number): { digits: string; end: number } {
  const first = tokens[start];
  if (first !== undefined && /^\d+$/.test(first)) return { digits: first, end: start + 1 };
  // Algarismo por algarismo, como se dita dose pequena: "zero zero cinco".
  let digits = '';
  let index = start;
  while ((spelled(tokens[index]) ?? 10) < 10) {
    digits += String(spelled(tokens[index]));
    index++;
  }
  if (digits.length > 1) return { digits, end: index };
  const whole = readSpelledInteger(tokens, start);
  return whole ? { digits: String(whole.value), end: whole.end } : { digits: '', end: start };
}

function readSpelledInteger(
  tokens: readonly string[],
  start: number,
): { value: number; end: number } | null {
  let thousands = 0;
  let group = 0;
  let any = false;
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index] as string;
    const value = spelled(token);
    if (token === 'mil' && thousands === 0) {
      thousands = (any ? group : 1) * 1000;
      group = 0;
      any = true;
      index++;
      continue;
    }
    // "zero cinco" são dois números; "mil e quinhentos" é um.
    const canGrow = group > 0 || thousands > 0;
    // Sem "e", só junta depois de centena ou de "mil" ("duzentos cinquenta", "mil quinhentos").
    const afterRound = group > 0 ? group % 100 === 0 : thousands > 0;
    if (value !== undefined && (!any || (afterRound && joins(group, value)))) {
      group += value;
      any = true;
      index++;
      continue;
    }
    const afterE = spelled(tokens[index + 1]);
    if (token === 'e' && canGrow && afterE !== undefined && joins(group, afterE)) {
      group += afterE;
      index += 2;
      continue;
    }
    break;
  }
  return any ? { value: thousands + group, end: index } : null;
}

/** Lê um número (algarismos ou por extenso) que começa em `start`. */
export function readNumber(tokens: readonly string[], start: number): NumberRead | null {
  const first = tokens[start];
  if (first === undefined) return null;

  let value: number;
  let end: number;
  let ambiguous = false;
  if (/^\d/.test(first)) {
    const digits = parseDigits(first);
    if (digits === null) return null;
    value = digits;
    end = start + 1;
    // "5 mil" (UI de heparina) é como o Whisper escreve "cinco mil".
    if (tokens[end] === 'mil') {
      value *= 1000;
      end++;
    }
  } else if (HALF.has(first)) {
    return { value: 0.5, end: start + 1, ambiguous: true };
  } else {
    const integer = readSpelledInteger(tokens, start);
    if (!integer) return null;
    value = integer.value;
    end = integer.end;
    ambiguous = end === start + 1 && AMBIGUOUS_ALONE.has(first);
    if (tokens[end] === 'virgula') {
      const fraction = readFraction(tokens, end + 1);
      if (fraction.digits !== '') {
        value = Number(`${value}.${fraction.digits}`);
        end = fraction.end;
        ambiguous = false;
      }
    }
  }

  if (tokens[end] === 'e' && HALF.has(tokens[end + 1] ?? '')) {
    value += 0.5;
    end += 2;
    ambiguous = false;
  }
  return { value, end, ambiguous };
}

/** Frases de unidade, do texto normalizado para a forma canônica. */
const BASE_UNITS: ReadonlyArray<readonly [string, string]> = [
  ['mg', 'mg'],
  ['miligrama', 'mg'],
  ['miligramas', 'mg'],
  ['mcg', 'mcg'],
  ['micrograma', 'mcg'],
  ['microgramas', 'mcg'],
  ['g', 'g'],
  ['grama', 'g'],
  ['gramas', 'g'],
  ['kg', 'kg'],
  ['quilo', 'kg'],
  ['quilos', 'kg'],
  ['kilo', 'kg'],
  ['kilos', 'kg'],
  ['quilograma', 'kg'],
  ['quilogramas', 'kg'],
  ['ml', 'mL'],
  ['mililitro', 'mL'],
  ['mililitros', 'mL'],
  ['l', 'L'],
  ['litro', 'L'],
  ['litros', 'L'],
  ['ui', 'UI'],
  ['u', 'UI'],
  ['unidade', 'UI'],
  ['unidades', 'UI'],
  ['unidade internacional', 'UI'],
  ['unidades internacionais', 'UI'],
  ['meq', 'mEq'],
  ['miliequivalente', 'mEq'],
  ['miliequivalentes', 'mEq'],
  ['mmol', 'mmol'],
  ['milimol', 'mmol'],
  ['milimols', 'mmol'],
  ['%', '%'],
  ['por cento', '%'],
  ['mmhg', 'mmHg'],
  ['milimetros de mercurio', 'mmHg'],
  ['bpm', 'bpm'],
  ['batimentos', 'bpm'],
  ['batimentos por minuto', 'bpm'],
  ['irpm', 'irpm'],
  ['ipm', 'irpm'],
  ['rpm', 'irpm'],
  ['incursoes', 'irpm'],
  ['incursoes por minuto', 'irpm'],
  ['incursoes respiratorias por minuto', 'irpm'],
  ['respiracoes por minuto', 'irpm'],
  ['grau', '°C'],
  ['graus', '°C'],
  ['graus celsius', '°C'],
  ['cm', 'cm'],
  ['centimetro', 'cm'],
  ['centimetros', 'cm'],
  ['ano', 'anos'],
  ['anos', 'anos'],
  ['mes', 'meses'],
  ['meses', 'meses'],
  ['semana', 'semanas'],
  ['semanas', 'semanas'],
  ['dia', 'dias'],
  ['dias', 'dias'],
  ['h', 'h'],
  ['hora', 'h'],
  ['horas', 'h'],
  ['min', 'min'],
  ['minuto', 'min'],
  ['minutos', 'min'],
  ['ampola', 'ampola'],
  ['ampolas', 'ampola'],
  ['amp', 'ampola'],
  ['comprimido', 'comprimido'],
  ['comprimidos', 'comprimido'],
  ['cp', 'comprimido'],
  ['gota', 'gota'],
  ['gotas', 'gota'],
  ['jato', 'jato'],
  ['jatos', 'jato'],
  ['puff', 'jato'],
  ['puffs', 'jato'],
  ['frasco', 'frasco'],
  ['frascos', 'frasco'],
];

/** Denominador depois de "/" ou "por": "mcg/kg/min", "microgramas por quilo por minuto". */
const DENOMINATORS: ReadonlyArray<readonly [string, string]> = [
  ['kg', 'kg'],
  ['quilo', 'kg'],
  ['kilo', 'kg'],
  ['quilograma', 'kg'],
  ['min', 'min'],
  ['minuto', 'min'],
  ['h', 'h'],
  ['hora', 'h'],
  ['dia', 'dia'],
  ['dl', 'dL'],
  ['decilitro', 'dL'],
];
const PER = new Set(['/', 'por']);

type Phrase = readonly [readonly string[], string];

/** Frases mais longas primeiro: "batimentos por minuto" antes de "batimentos". */
function phrases(table: ReadonlyArray<readonly [string, string]>): Phrase[] {
  return table
    .map(([text, canonical]): Phrase => [clinicalTokens(text), canonical])
    .sort((left, right) => right[0].length - left[0].length);
}

const BASE_PHRASES = phrases(BASE_UNITS);
const DENOMINATOR_PHRASES = phrases(DENOMINATORS);

function matchPhrase(
  tokens: readonly string[],
  start: number,
  table: readonly Phrase[],
): { canonical: string; end: number } | null {
  for (const [words, canonical] of table) {
    if (words.every((word, offset) => tokens[start + offset] === word)) {
      return { canonical, end: start + words.length };
    }
  }
  return null;
}

/** Unidade que começa em `start`, com quantos denominadores vierem ("mcg/kg/min"). */
export function readUnit(
  tokens: readonly string[],
  start: number,
): { unit: string; end: number } | null {
  const base = matchPhrase(tokens, start, BASE_PHRASES);
  if (!base) return null;
  let unit = base.canonical;
  let end = base.end;
  while (PER.has(tokens[end] ?? '')) {
    const denominator = matchPhrase(tokens, end + 1, DENOMINATOR_PHRASES);
    if (!denominator) break;
    unit += `/${denominator.canonical}`;
    end = denominator.end;
  }
  return { unit, end };
}

export const QUANTITY_KINDS = ['dose', 'vital', 'time', 'other'] as const;
export type QuantityKind = (typeof QUANTITY_KINDS)[number];

export const QUANTITY_KIND_LABELS: Record<QuantityKind, string> = {
  dose: 'doses e volumes',
  vital: 'sinais vitais e medidas',
  time: 'idade e tempo',
  other: 'outros números',
};

export interface Quantity {
  value: number;
  unit: string | null;
  kind: QuantityKind;
}

const DOSE_UNITS = new Set([
  'mg',
  'mcg',
  'g',
  'mL',
  'L',
  'UI',
  'mEq',
  'mmol',
  'ampola',
  'comprimido',
  'gota',
  'jato',
  'frasco',
]);
const VITAL_UNITS = new Set(['mmHg', 'bpm', 'irpm', '°C', 'kg', 'cm']);
const TIME_UNITS = new Set(['anos', 'meses', 'semanas', 'dias', 'h', 'min']);
/** Rótulo de sinal vital até 3 tokens antes do número ("PA 120", "frequência cardíaca 110"). */
const VITAL_LABELS = new Set([
  'pa',
  'pas',
  'pad',
  'pam',
  'pressao',
  'fc',
  'frequencia',
  'fr',
  'sat',
  'sato2',
  'spo2',
  'saturacao',
  'tax',
  'temp',
  'temperatura',
  'glicemia',
  'hgt',
  'dextro',
  'glasgow',
  'gcs',
  'peso',
  'altura',
  'fio2',
]);
const LABEL_WINDOW = 3;
/** "120 por 80", "120x80", "120/80": o segundo número herda o tipo do primeiro. */
const PAIR_SEPARATORS = new Set(['por', 'x', '/']);

function hasVitalLabel(tokens: readonly string[], start: number): boolean {
  for (let index = start - 1; index >= Math.max(0, start - LABEL_WINDOW); index--) {
    const token = tokens[index] as string;
    if (isNumberToken(token)) return false;
    if (VITAL_LABELS.has(token)) return true;
  }
  return false;
}

function kindOf(unit: string | null, labeled: boolean): QuantityKind {
  if (unit === null) return labeled ? 'vital' : 'other';
  if (unit === '%') return labeled ? 'vital' : 'dose';
  if (unit.endsWith('/dL')) return 'vital';
  const base = unit.split('/')[0] as string;
  if (DOSE_UNITS.has(base)) return 'dose';
  if (VITAL_UNITS.has(base)) return 'vital';
  if (TIME_UNITS.has(base) && unit === base) return 'time';
  return labeled ? 'vital' : 'other';
}

export function extractQuantities(text: string): Quantity[] {
  const tokens = clinicalTokens(text);
  const quantities: Quantity[] = [];
  let index = 0;
  let pairedKind: QuantityKind | null = null;
  while (index < tokens.length) {
    const number = readNumber(tokens, index);
    if (!number) {
      index++;
      pairedKind = null;
      continue;
    }
    const unit = readUnit(tokens, number.end);
    if (number.ambiguous && !unit) {
      index = number.end;
      pairedKind = null;
      continue;
    }
    const ownKind = kindOf(unit?.unit ?? null, hasVitalLabel(tokens, index));
    const kind: QuantityKind = ownKind === 'other' && pairedKind !== null ? pairedKind : ownKind;
    quantities.push({ value: number.value, unit: unit?.unit ?? null, kind });
    index = unit?.end ?? number.end;

    const separatorFollowedByNumber =
      PAIR_SEPARATORS.has(tokens[index] ?? '') && readNumber(tokens, index + 1) !== null;
    pairedKind = separatorFollowedByNumber ? kind : null;
    if (separatorFollowedByNumber) index++;
  }
  return quantities;
}

function quantityKey({ value, unit }: Quantity): string {
  return `${Math.round(value * 1e6) / 1e6}|${unit ?? ''}`;
}

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 4,
  useGrouping: false,
});

export function formatQuantity({ value, unit }: Quantity): string {
  const number = NUMBER_FORMAT.format(value);
  if (unit === null) return number;
  return unit === '%' || unit === '°C' ? `${number}${unit}` : `${number} ${unit}`;
}

export interface QuantityComparison {
  byKind: Record<QuantityKind, { reference: number; matched: number }>;
  /** Da referência, sem par na transcrição (valor e unidade). */
  missed: Quantity[];
  /** Da transcrição, sem par na referência: número ouvido errado ou inventado. */
  extra: Quantity[];
}

/**
 * Pareia por valor e unidade, com multiplicidade ("FC 80, PA 120 por 80"
 * tem dois 80). Unidade perdida conta como erro: "0,5" não é "0,5 mg". O tipo
 * (dose, sinal vital...) vem da referência.
 */
export function compareQuantities(
  reference: readonly Quantity[],
  hypothesis: readonly Quantity[],
): QuantityComparison {
  const available = new Map<string, Quantity[]>();
  for (const quantity of hypothesis) {
    const key = quantityKey(quantity);
    available.set(key, [...(available.get(key) ?? []), quantity]);
  }

  const byKind = Object.fromEntries(
    QUANTITY_KINDS.map((kind) => [kind, { reference: 0, matched: 0 }]),
  ) as QuantityComparison['byKind'];
  const missed: Quantity[] = [];
  for (const quantity of reference) {
    byKind[quantity.kind].reference += 1;
    const candidates = available.get(quantityKey(quantity));
    if (candidates && candidates.length > 0) {
      candidates.pop();
      byKind[quantity.kind].matched += 1;
    } else {
      missed.push(quantity);
    }
  }
  const extra = [...available.values()].flat();
  // Mantém a ordem em que apareceram na transcrição.
  extra.sort((left, right) => hypothesis.indexOf(left) - hypothesis.indexOf(right));
  return { byKind, missed, extra };
}

interface TermPhrase {
  term: string;
  words: string[];
}

function termPhrases(vocabulary: readonly VocabularyEntry[]): TermPhrase[] {
  return vocabulary
    .flatMap((entry) =>
      entry.kind === 'unidade'
        ? []
        : [entry.term, ...(entry.aliases ?? [])].map((text) => ({
            term: entry.term,
            words: clinicalTokens(text),
          })),
    )
    .filter(({ words }) => words.length > 0)
    .sort((left, right) => right.words.length - left.words.length);
}

/**
 * Quantas vezes cada termo aparece. Palavra inteira ("adrenalina" não casa
 * dentro de "noradrenalina") e a frase mais longa ganha ("bicarbonato de
 * sódio" não conta também "bicarbonato"). Unidade conta pelas quantidades:
 * "mcg/kg/min" só existe depois de um número, e assim "microgramas por quilo
 * por minuto" também conta.
 */
export function countTerms(
  text: string,
  vocabulary: readonly VocabularyEntry[],
): Map<string, number> {
  const tokens = clinicalTokens(text);
  const consumed = new Array<boolean>(tokens.length).fill(false);
  const counts = new Map<string, number>();
  const add = (term: string, amount: number) => counts.set(term, (counts.get(term) ?? 0) + amount);

  const phrasesByLength = termPhrases(vocabulary);
  for (let start = 0; start < tokens.length; start++) {
    if (consumed[start]) continue;
    const match = phrasesByLength.find(({ words }) =>
      words.every((word, offset) => tokens[start + offset] === word && !consumed[start + offset]),
    );
    if (!match) continue;
    match.words.forEach((_, offset) => (consumed[start + offset] = true));
    add(match.term, 1);
  }

  const units = new Set(vocabulary.filter((e) => e.kind === 'unidade').map((e) => e.term));
  for (const { unit } of extractQuantities(text)) {
    if (unit !== null && units.has(unit)) add(unit, 1);
  }
  return counts;
}

export interface TermCount {
  term: string;
  kind: VocabularyKind;
  reference: number;
  matched: number;
  /** Ocorrências na transcrição além das da referência (troca ou invenção). */
  extra: number;
}

export function compareTerms(
  reference: string,
  hypothesis: string,
  vocabulary: readonly VocabularyEntry[],
): TermCount[] {
  const inReference = countTerms(reference, vocabulary);
  const inHypothesis = countTerms(hypothesis, vocabulary);
  return vocabulary
    .map(({ term, kind }) => {
      const expected = inReference.get(term) ?? 0;
      const found = inHypothesis.get(term) ?? 0;
      const matched = Math.min(expected, found);
      return { term, kind, reference: expected, matched, extra: found - matched };
    })
    .filter(({ reference: expected, extra }) => expected > 0 || extra > 0);
}

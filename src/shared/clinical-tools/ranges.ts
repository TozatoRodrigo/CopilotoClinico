import { formatCompact, parseDecimal } from './numbers';

/**
 * Faixa aceita por um campo numérico. Fora dela o valor é recusado e nada é
 * calculado (ADR-017): no ANY a faixa era só o min/max do HTML e não barrava
 * nada.
 */
export interface NumericRange {
  min: number;
  max: number;
  /** Unidade exibida ao lado do campo e nas mensagens ("kg", "bpm"). */
  unit: string;
}

export type WeightPopulation = 'adulto' | 'pediatrico';

/** Faixas de peso do ANY (`ADULT_WEIGHT_RANGE`, `PED_WEIGHT_RANGE`). */
export const WEIGHT_RANGES: Record<WeightPopulation, NumericRange & { label: string }> = {
  adulto: { min: 40, max: 200, unit: 'kg', label: 'Adulto' },
  pediatrico: { min: 0.5, max: 50, unit: 'kg', label: 'Pediátrico' },
};

export type NumericFieldError =
  | { kind: 'empty'; message: string }
  | { kind: 'not-a-number'; message: string }
  | { kind: 'ambiguous-separator'; message: string }
  | { kind: 'out-of-range'; message: string; range: NumericRange };

export type NumericFieldResult =
  | { ok: true; value: number }
  | { ok: false; error: NumericFieldError };

/** "40 a 200 kg", "0,5 a 50 kg". */
export function describeRange(range: NumericRange): string {
  return `${formatCompact(range.min)} a ${formatCompact(range.max)} ${range.unit}`;
}

/**
 * Lê e valida um campo numérico. Toda conta passa por aqui antes de usar o
 * valor: o que sai `ok: false` não pode virar resultado.
 */
export function validateNumber(raw: string, range: NumericRange): NumericFieldResult {
  const parsed = parseDecimal(raw);
  if (!parsed.ok) {
    switch (parsed.reason) {
      case 'empty':
        return { ok: false, error: { kind: 'empty', message: 'Campo obrigatório.' } };
      case 'ambiguous-separator':
        return {
          ok: false,
          error: {
            kind: 'ambiguous-separator',
            message: 'Use vírgula para decimais e não use ponto de milhar (ex.: 1500 ou 1,5).',
          },
        };
      case 'not-a-number':
        return {
          ok: false,
          error: { kind: 'not-a-number', message: 'Digite só números, com vírgula para decimais.' },
        };
    }
  }
  const { value } = parsed;
  if (value < range.min || value > range.max) {
    return {
      ok: false,
      error: {
        kind: 'out-of-range',
        message: `Fora da faixa aceita: ${describeRange(range)}.`,
        range,
      },
    };
  }
  return { ok: true, value };
}

/** Peso adulto 40–200 kg; pediátrico 0,5–50 kg. */
export function validateWeight(raw: string, population: WeightPopulation): NumericFieldResult {
  return validateNumber(raw, WEIGHT_RANGES[population]);
}

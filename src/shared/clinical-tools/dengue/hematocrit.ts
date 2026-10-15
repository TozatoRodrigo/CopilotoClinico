import { validateNumber, type NumericFieldError, type NumericRange } from '../ranges';
import type { ResultTone } from '../tone';

/**
 * Variação do hematócrito na dengue (CC-325): (Ht atual − Ht basal) / Ht basal
 * × 100, com as cinco faixas da calculadora do ANY. Mesma expressão e mesmos
 * limites; o teste diferencial compara valor, faixa e tom em 1.000 pares.
 */

/**
 * Faixa aceita para o Ht digitado. O ANY não tinha faixa (aceitava qualquer
 * número positivo); esta vai para a revisão clínica (CC-310).
 */
export const HEMATOCRIT_RANGE: NumericRange = { min: 10, max: 80, unit: '%' };

export function hematocritVariation(baseline: number, current: number): number {
  return ((current - baseline) / baseline) * 100;
}

export interface HematocritBand {
  id: 'hemoconcentracao' | 'elevacao-moderada' | 'elevacao-discreta' | 'queda' | 'estavel';
  label: string;
  tone: ResultTone;
}

/** Faixas do ANY, lidas em ordem; vale a primeira que cabe. */
export function interpretHematocritVariation(variation: number): HematocritBand {
  if (variation >= 20) {
    return {
      id: 'hemoconcentracao',
      label: 'Hemoconcentração significativa (≥20%)',
      tone: 'critical',
    };
  }
  if (variation >= 10) {
    return { id: 'elevacao-moderada', label: 'Elevação moderada — monitorizar', tone: 'attention' };
  }
  if (variation > 0)
    return { id: 'elevacao-discreta', label: 'Elevação discreta', tone: 'neutral' };
  if (variation < -10) {
    return {
      id: 'queda',
      label: 'Queda significativa — avaliar hemorragia se piora clínica',
      tone: 'attention',
    };
  }
  return { id: 'estavel', label: 'Estável ou em queda discreta', tone: 'neutral' };
}

/** "+20,0%", "-12,5%": sinal explícito na alta, uma casa, vírgula decimal. */
export function formatHematocritVariation(variation: number): string {
  return `${variation >= 0 ? '+' : ''}${variation.toFixed(1).replace('.', ',')}%`;
}

export type HematocritEvaluation =
  | {
      status: 'pending';
      /** Campo com valor inválido ou fora da faixa, por campo. */
      errors: Partial<Record<'baseline' | 'current', NumericFieldError>>;
    }
  | {
      status: 'complete';
      baseline: number;
      current: number;
      variation: number;
      display: string;
      band: HematocritBand;
    };

/** Valida os dois Ht digitados e, só com os dois dentro da faixa, calcula. */
export function evaluateHematocrit(raw: {
  baseline: string;
  current: string;
}): HematocritEvaluation {
  const baseline = validateNumber(raw.baseline, HEMATOCRIT_RANGE);
  const current = validateNumber(raw.current, HEMATOCRIT_RANGE);
  if (!baseline.ok || !current.ok) {
    const errors: Partial<Record<'baseline' | 'current', NumericFieldError>> = {};
    if (!baseline.ok && baseline.error.kind !== 'empty') errors.baseline = baseline.error;
    if (!current.ok && current.error.kind !== 'empty') errors.current = current.error;
    return { status: 'pending', errors };
  }
  const variation = hematocritVariation(baseline.value, current.value);
  return {
    status: 'complete',
    baseline: baseline.value,
    current: current.value,
    variation,
    display: formatHematocritVariation(variation),
    band: interpretHematocritVariation(variation),
  };
}

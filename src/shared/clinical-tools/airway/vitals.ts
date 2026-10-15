import { SHOCK_INDEX } from '../calculators/shock-index';
import { formatDecimal } from '../numbers';
import type { NumericRange } from '../ranges';
import type { ResultTone } from '../tone';

/**
 * Sinais vitais e medidas do roteiro de via aérea: faixas dos campos, índice
 * de choque do passo CRASH e os avisos de FC e PAS do AirwayGuide do ANY.
 */

function shockIndexInput(id: 'hr' | 'sbp'): NumericRange {
  const input = SHOCK_INDEX.inputs.find((candidate) => candidate.id === id);
  if (!input) throw new Error(`Campo "${id}" ausente na calculadora de índice de choque.`);
  return { min: input.min, max: input.max, unit: input.unit };
}

/**
 * Faixas dos campos (ADR-017: fora da faixa é erro e não calcula). No ANY os
 * campos do roteiro não tinham faixa; FC e PAS usam as da calculadora de
 * índice de choque do próprio ANY, a altura usa a faixa que o ANY aceitava
 * para o tubo laríngeo (100–250 cm), e profundidade e cuff foram definidas
 * no porte (docs/ferramentas/revisao-clinica/via-aerea.md).
 */
export const AIRWAY_RANGES = {
  heartRate: shockIndexInput('hr'),
  systolic: shockIndexInput('sbp'),
  height: { min: 100, max: 250, unit: 'cm' },
  depth: { min: 10, max: 35, unit: 'cm' },
  cuff: { min: 10, max: 50, unit: 'cmH2O' },
} as const satisfies Record<string, NumericRange>;

/** Índice de choque acima de 1,0 marca o H do CRASH (regra do ANY). */
export const SHOCK_INDEX_MARKS_H_ABOVE = 1.0;
/** Acima de 0,7 o ANY pintava o índice de amarelo (atenção). */
export const SHOCK_INDEX_ATTENTION_ABOVE = 0.7;

export interface AirwayShockIndex {
  /** FC ÷ PAS sem arredondar: é o que o ANY compara com 1,0 para marcar o H. */
  ratio: number;
  /** Com 2 casas, como o ANY guarda e mostra. */
  value: number;
  tone: ResultTone;
  label: string;
  marksH: boolean;
}

export function airwayShockIndex(heartRate: number, systolic: number): AirwayShockIndex {
  const ratio = heartRate / systolic;
  const value = Number(ratio.toFixed(2));
  if (ratio > SHOCK_INDEX_MARKS_H_ABOVE) {
    return { ratio, value, tone: 'critical', label: 'Acima de 1,0 (marca o H)', marksH: true };
  }
  if (ratio > SHOCK_INDEX_ATTENTION_ABOVE) {
    return { ratio, value, tone: 'attention', label: 'Acima de 0,7', marksH: false };
  }
  return { ratio, value, tone: 'neutral', label: 'Até 0,7', marksH: false };
}

/** "1,22". */
export function formatShockIndex(shockIndex: AirwayShockIndex): string {
  return formatDecimal(shockIndex.value, 2);
}

interface VitalRule {
  when: 'above' | 'below';
  limit: number;
  tone: ResultTone;
  label: string;
}

/** Avisos da FC, na ordem do ANY: vale a primeira regra que bate. */
export const HEART_RATE_RULES: readonly VitalRule[] = [
  { when: 'above', limit: 120, tone: 'critical', label: 'Taquicardia importante' },
  { when: 'above', limit: 100, tone: 'attention', label: 'Taquicardia' },
  { when: 'below', limit: 50, tone: 'critical', label: 'Bradicardia importante' },
  { when: 'below', limit: 60, tone: 'attention', label: 'Bradicardia' },
];

/** Avisos da PAS, na ordem do ANY. */
export const SYSTOLIC_RULES: readonly VitalRule[] = [
  { when: 'below', limit: 90, tone: 'critical', label: 'Hipotensão' },
  { when: 'below', limit: 100, tone: 'attention', label: 'PAS limítrofe' },
  { when: 'above', limit: 180, tone: 'attention', label: 'Hipertensão' },
];

export interface VitalAlert {
  tone: ResultTone;
  label: string;
}

function firstMatch(rules: readonly VitalRule[], value: number): VitalAlert | null {
  const rule = rules.find(({ when, limit }) => (when === 'above' ? value > limit : value < limit));
  return rule ? { tone: rule.tone, label: rule.label } : null;
}

export function heartRateAlert(heartRate: number): VitalAlert | null {
  return firstMatch(HEART_RATE_RULES, heartRate);
}

export function systolicAlert(systolic: number): VitalAlert | null {
  return firstMatch(SYSTOLIC_RULES, systolic);
}

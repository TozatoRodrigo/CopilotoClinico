import type { CalculatorDefinition } from './calculator';
import { CHADSVASC } from './calculators/chadsvasc';
import { CURB65 } from './calculators/curb65';
import { HAS_BLED } from './calculators/has-bled';
import { QSOFA } from './calculators/qsofa';
import { SHOCK_INDEX } from './calculators/shock-index';

/**
 * Calculadoras já portadas do ANY, com teste diferencial contra a referência
 * (tests/clinical-tools). As demais do catálogo aparecem como "em breve"
 * (CC-306 a CC-309).
 */
export const CALCULATORS: readonly CalculatorDefinition[] = [
  CHADSVASC,
  HAS_BLED,
  QSOFA,
  CURB65,
  SHOCK_INDEX,
];

const BY_ID = new Map(CALCULATORS.map((calculator) => [calculator.id, calculator]));

export function getCalculator(id: string): CalculatorDefinition | undefined {
  return BY_ID.get(id);
}

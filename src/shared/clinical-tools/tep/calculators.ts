import type { CalculatorDefinition } from '../calculator';
import { PERC_RULE } from '../calculators/perc-rule';
import { D_DIMER_AGE_ADJUSTED, YEARS, YEARS_PREGNANCY } from './d-dimer';
import { ECHO_RV } from './echo';
import { BOVA, HESTIA, PESI, SPESI } from './severity';
import { WELLS_TEP } from './wells';

/**
 * As nove calculadoras do TEP, na ordem da aba "Calculadoras" do ANY. O PERC
 * é o mesmo do catálogo de calculadoras (CC-307): a conta não se repete.
 * Ficam fora do registro das 75 (registry.ts) porque no ANY moram no roteiro,
 * não no `calculatorData.ts`.
 */
export const TEP_CALCULATORS: readonly CalculatorDefinition[] = [
  PERC_RULE,
  WELLS_TEP,
  D_DIMER_AGE_ADJUSTED,
  YEARS,
  YEARS_PREGNANCY,
  SPESI,
  PESI,
  BOVA,
  HESTIA,
];

/** Calculadoras que o roteiro usa, inclusive o eco do paciente instável. */
export const TEP_PATHWAY_CALCULATORS = {
  wells: WELLS_TEP,
  perc: PERC_RULE,
  dDimer: D_DIMER_AGE_ADJUSTED,
  years: YEARS,
  yearsPregnancy: YEARS_PREGNANCY,
  spesi: SPESI,
  pesi: PESI,
  hestia: HESTIA,
  echo: ECHO_RV,
} as const satisfies Record<string, CalculatorDefinition>;

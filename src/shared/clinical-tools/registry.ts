import type { CalculatorDefinition } from './calculator';
import { ABC2 } from './calculators/abc2';
import { ABCD2 } from './calculators/abcd2';
import { ADD_RS } from './calculators/add-rs';
import { APACHE_II } from './calculators/apache-ii';
import { CAM_ICU } from './calculators/cam-icu';
import { CAPRINI } from './calculators/caprini';
import { CHADSVASC } from './calculators/chadsvasc';
import { CRITERIOS_LIGHT } from './calculators/criterios-light';
import { CURB65 } from './calculators/curb65';
import { EGSYS } from './calculators/egsys';
import { FISHER_MODIFICADO } from './calculators/fisher-modificado';
import { FOUR_SCORE } from './calculators/four-score';
import { GCS } from './calculators/gcs';
import { GRACE_SCORE } from './calculators/grace-score';
import { HAS_BLED } from './calculators/has-bled';
import { HEART_SCORE } from './calculators/heart-score';
import { HINTS_PLUS } from './calculators/hints-plus';
import { HUNT_HESS } from './calculators/hunt-hess';
import { ICH_SCORE } from './calculators/ich-score';
import { NEWS2 } from './calculators/news2';
import { NIHSS } from './calculators/nihss';
import { OTTAWA_HSA } from './calculators/ottawa-hsa';
import { PERC_RULE } from './calculators/perc-rule';
import { QSOFA } from './calculators/qsofa';
import { SF_SYNCOPE } from './calculators/sf-syncope';
import { SHOCK_INDEX } from './calculators/shock-index';
import { SOFA } from './calculators/sofa';
import { TEMPO_O2 } from './calculators/tempo-o2';
import { TIMI_NSTEMI } from './calculators/timi-nstemi';

/**
 * Calculadoras já portadas do ANY, com teste diferencial contra a referência
 * (tests/clinical-tools). As demais do catálogo aparecem como "em breve".
 * Agrupadas pelo lote do porte (CC-307 a CC-309).
 */
export const CALCULATORS: readonly CalculatorDefinition[] = [
  // Lote A (CC-307): cardiologia, neurologia, vascular, respiratório e sepse.
  HEART_SCORE,
  TIMI_NSTEMI,
  GRACE_SCORE,
  CHADSVASC,
  HAS_BLED,
  EGSYS,
  SF_SYNCOPE,
  HUNT_HESS,
  FISHER_MODIFICADO,
  FOUR_SCORE,
  OTTAWA_HSA,
  HINTS_PLUS,
  CAM_ICU,
  NIHSS,
  GCS,
  ABCD2,
  ICH_SCORE,
  ABC2,
  ADD_RS,
  CAPRINI,
  PERC_RULE,
  CURB65,
  QSOFA,
  SOFA,
  TEMPO_O2,
  NEWS2,
  CRITERIOS_LIGHT,
  APACHE_II,
  // Lote B (CC-308): gastro, trauma, hemodinâmica, toxicologia, renal e metabólico.
  SHOCK_INDEX,
];

const BY_ID = new Map(CALCULATORS.map((calculator) => [calculator.id, calculator]));

export function getCalculator(id: string): CalculatorDefinition | undefined {
  return BY_ID.get(id);
}

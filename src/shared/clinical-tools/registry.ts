import type { CalculatorDefinition } from './calculator';
import { ABC2 } from './calculators/abc2';
import { ABCD2 } from './calculators/abcd2';
import { ADD_RS } from './calculators/add-rs';
import { AKIN_KDIGO } from './calculators/akin-kdigo';
import { ALVARADO } from './calculators/alvarado';
import { ANION_GAP } from './calculators/anion-gap';
import { APACHE_II } from './calculators/apache-ii';
import { BONACINI } from './calculators/bonacini';
import { CAM_ICU } from './calculators/cam-icu';
import { CANADIAN_CSPINE } from './calculators/canadian-cspine';
import { CAPRINI } from './calculators/caprini';
import { CHADSVASC } from './calculators/chadsvasc';
import { CHILD_PUGH } from './calculators/child-pugh';
import { CIWA_AR } from './calculators/ciwa-ar';
import { CKD_EPI } from './calculators/ckd-epi';
import { COCKCROFT_GAULT } from './calculators/cockcroft-gault';
import { CORRECAO_CALCIO } from './calculators/correcao-calcio';
import { CORRECAO_NA } from './calculators/correcao-na';
import { CORRECAO_NA_ADROGUE } from './calculators/correcao-na-adrogue';
import { CORRECAO_POTASSIO } from './calculators/correcao-potassio';
import { CRITERIOS_LIGHT } from './calculators/criterios-light';
import { CURB65 } from './calculators/curb65';
import { DC_VTI } from './calculators/dc-vti';
import { DEFICIT_AGUA } from './calculators/deficit-agua';
import { DELTA_GAP } from './calculators/delta-gap';
import { EGSYS } from './calculators/egsys';
import { FISHER_MODIFICADO } from './calculators/fisher-modificado';
import { FORMULA_WINTERS } from './calculators/formula-winters';
import { FORREST } from './calculators/forrest';
import { FOUR_SCORE } from './calculators/four-score';
import { GCS } from './calculators/gcs';
import { GLASGOW_BLATCHFORD } from './calculators/glasgow-blatchford';
import { GRACE_SCORE } from './calculators/grace-score';
import { GRADIENTE_AA } from './calculators/gradiente-aa';
import { HAS_BLED } from './calculators/has-bled';
import { HEART_SCORE } from './calculators/heart-score';
import { HINTS_PLUS } from './calculators/hints-plus';
import { HUNT_HESS } from './calculators/hunt-hess';
import { ICH_SCORE } from './calculators/ich-score';
import { INTERVALO_OSMOLAR } from './calculators/intervalo-osmolar';
import { MBIG } from './calculators/mbig';
import { MELD_NA } from './calculators/meld-na';
import { NEWS2 } from './calculators/news2';
import { NIHSS } from './calculators/nihss';
import { NOMOGRAMA_RUMACK } from './calculators/nomograma-rumack';
import { OSMOLARIDADE } from './calculators/osmolaridade';
import { OTTAWA_HSA } from './calculators/ottawa-hsa';
import { PAM } from './calculators/pam';
import { PARKLAND } from './calculators/parkland';
import { PECARN } from './calculators/pecarn';
import { PERC_RULE } from './calculators/perc-rule';
import { PSS } from './calculators/pss';
import { QSOFA } from './calculators/qsofa';
import { QTC_CORRIGIDO } from './calculators/qtc-corrigido';
import { ROCKALL } from './calculators/rockall';
import { SF_SYNCOPE } from './calculators/sf-syncope';
import { SHOCK_INDEX } from './calculators/shock-index';
import { SOFA } from './calculators/sofa';
import { TASH } from './calculators/tash';
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
  ROCKALL,
  GLASGOW_BLATCHFORD,
  FORREST,
  CHILD_PUGH,
  MELD_NA,
  BONACINI,
  ALVARADO,
  TASH,
  PECARN,
  MBIG,
  CANADIAN_CSPINE,
  PARKLAND,
  DC_VTI,
  GRADIENTE_AA,
  DELTA_GAP,
  SHOCK_INDEX,
  PAM,
  FORMULA_WINTERS,
  CIWA_AR,
  PSS,
  NOMOGRAMA_RUMACK,
  QTC_CORRIGIDO,
  INTERVALO_OSMOLAR,
  AKIN_KDIGO,
  CORRECAO_NA,
  DEFICIT_AGUA,
  OSMOLARIDADE,
  CORRECAO_NA_ADROGUE,
  COCKCROFT_GAULT,
  CKD_EPI,
  CORRECAO_CALCIO,
  CORRECAO_POTASSIO,
  ANION_GAP,
];

const BY_ID = new Map(CALCULATORS.map((calculator) => [calculator.id, calculator]));

export function getCalculator(id: string): CalculatorDefinition | undefined {
  return BY_ID.get(id);
}

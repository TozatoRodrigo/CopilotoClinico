import type { CalculatorDefinition } from './calculator';
import { ABC2 } from './calculators/abc2';
import { ABCD2 } from './calculators/abcd2';
import { ADD_RS } from './calculators/add-rs';
import { AKIN_KDIGO } from './calculators/akin-kdigo';
import { ALVARADO } from './calculators/alvarado';
import { ANION_GAP } from './calculators/anion-gap';
import { APACHE_II } from './calculators/apache-ii';
import { BISHOP } from './calculators/bishop';
import { BONACINI } from './calculators/bonacini';
import { BPS } from './calculators/bps';
import { CAM_ICU } from './calculators/cam-icu';
import { CANADIAN_CSPINE } from './calculators/canadian-cspine';
import { CAPRINI } from './calculators/caprini';
import { CENTOR_MCISAAC } from './calculators/centor-mcisaac';
import { CHADSVASC } from './calculators/chadsvasc';
import { CHILD_PUGH } from './calculators/child-pugh';
import { CIWA_AR } from './calculators/ciwa-ar';
import { CKD_EPI } from './calculators/ckd-epi';
import { COCKCROFT_GAULT } from './calculators/cockcroft-gault';
import { CORMACK_LEHANE } from './calculators/cormack-lehane';
import { CORRECAO_CALCIO } from './calculators/correcao-calcio';
import { CORRECAO_NA } from './calculators/correcao-na';
import { CORRECAO_NA_ADROGUE } from './calculators/correcao-na-adrogue';
import { CORRECAO_POTASSIO } from './calculators/correcao-potassio';
import { CORTICOIDE_EQUIV } from './calculators/corticoide-equiv';
import { CRITERIOS_LIGHT } from './calculators/criterios-light';
import { CURB65 } from './calculators/curb65';
import { DC_VTI } from './calculators/dc-vti';
import { DEFICIT_AGUA } from './calculators/deficit-agua';
import { DELTA_GAP } from './calculators/delta-gap';
import { DPP_DUM } from './calculators/dpp-dum';
import { EGSYS } from './calculators/egsys';
import { EVA_NRS } from './calculators/eva-nrs';
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
import { HELLP } from './calculators/hellp';
import { HINTS_PLUS } from './calculators/hints-plus';
import { HUNT_HESS } from './calculators/hunt-hess';
import { ICH_SCORE } from './calculators/ich-score';
import { IDADE_GESTACIONAL } from './calculators/idade-gestacional';
import { INTERVALO_OSMOLAR } from './calculators/intervalo-osmolar';
import { MALLAMPATI } from './calculators/mallampati';
import { MBIG } from './calculators/mbig';
import { MELD_NA } from './calculators/meld-na';
import { MGSO4_DOSE } from './calculators/mgso4-dose';
import { NEWS2 } from './calculators/news2';
import { NIHSS } from './calculators/nihss';
import { NOMOGRAMA_RUMACK } from './calculators/nomograma-rumack';
import { OSMOLARIDADE } from './calculators/osmolaridade';
import { OTTAWA_HSA } from './calculators/ottawa-hsa';
import { PAM } from './calculators/pam';
import { PARKLAND } from './calculators/parkland';
import { PECARN } from './calculators/pecarn';
import { PERC_RULE } from './calculators/perc-rule';
import { POSICAO_CVC } from './calculators/posicao-cvc';
import { PSS } from './calculators/pss';
import { QSOFA } from './calculators/qsofa';
import { QTC_CORRIGIDO } from './calculators/qtc-corrigido';
import { RASS } from './calculators/rass';
import { ROCKALL } from './calculators/rockall';
import { SF_SYNCOPE } from './calculators/sf-syncope';
import { SHOCK_INDEX } from './calculators/shock-index';
import { SOFA } from './calculators/sofa';
import { TASH } from './calculators/tash';
import { TEMPO_O2 } from './calculators/tempo-o2';
import { TIMI_NSTEMI } from './calculators/timi-nstemi';
import { VTI_CLASSIFICACAO } from './calculators/vti-classificacao';

/**
 * As 75 calculadoras do ANY, com teste diferencial contra a referência
 * (tests/clinical-tools). Calculadora do catálogo fora desta lista aparece
 * como "em breve". Agrupadas pelo lote do porte (CC-307 a CC-309).
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
  // Lote C (CC-309): obstetrícia, via aérea, sedação e dor, infecção, farmacologia,
  // procedimentos e POCUS.
  DPP_DUM,
  BISHOP,
  IDADE_GESTACIONAL,
  HELLP,
  MGSO4_DOSE,
  CORMACK_LEHANE,
  MALLAMPATI,
  RASS,
  BPS,
  EVA_NRS,
  CENTOR_MCISAAC,
  CORTICOIDE_EQUIV,
  POSICAO_CVC,
  VTI_CLASSIFICACAO,
];

const BY_ID = new Map(CALCULATORS.map((calculator) => [calculator.id, calculator]));

export function getCalculator(id: string): CalculatorDefinition | undefined {
  return BY_ID.get(id);
}

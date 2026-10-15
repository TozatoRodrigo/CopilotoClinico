import type { ContentProvenance } from '../provenance';

/** Conteúdo portado do VM Guide do ANY App v4 (CC-327). */
export const ANY_V4_VM_SOURCE = 'ANY App v4 · vmData.ts e VmGuide.tsx (95c8fba)';

/** Sobe a cada mudança clínica decidida na revisão (CC-310). */
export const VENTILATION_PROVENANCE: ContentProvenance = {
  source: ANY_V4_VM_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

export const VENTILATION_TOOL_NAME = 'Ventilação mecânica';

/** Lista de referências do VM Guide (`VM_REFERENCES`), na ordem do ANY. */
export const VENTILATION_REFERENCES = {
  sdra: 'Matthay MA, et al. A New Global Definition of ARDS. Am J Respir Crit Care Med. 2024;209(1):37-47.',
  drivingPressure:
    'Amato MB, et al. Driving pressure and survival in ARDS. N Engl J Med. 2015;372(8):747-55.',
  tobin:
    'Yang KL, Tobin MJ. A prospective study of indexes predicting the outcome of trials of weaning from mechanical ventilation. N Engl J Med. 1991;324(21):1445-50.',
  rox: 'Roca O, et al. An index combining respiratory rate and oxygenation to predict outcome of nasal high-flow therapy. Am J Respir Crit Care Med. 2019;199(11):1368-76.',
  mechanicalPower:
    'Gattinoni L, et al. Ventilator-related causes of lung injury: the mechanical power. Intensive Care Med. 2016;42(10):1567-75.',
  pmus: 'Bertoni M, et al. A novel non-invasive method to detect excessively high respiratory effort and dynamic transpulmonary driving pressure during mechanical ventilation. Crit Care. 2019;23(1):346.',
  asynchrony:
    'Thille AW, et al. Patient-ventilator asynchrony during assisted mechanical ventilation. Intensive Care Med. 2006;32(10):1515-22.',
  hacorUpdated:
    'Duan J, et al. An updated HACOR score for predicting the failure of noninvasive ventilation: a multicenter prospective observational study. Crit Care. 2017;21(1):300.',
} as const;

export const VENTILATION_REFERENCE_LIST: readonly string[] = Object.values(VENTILATION_REFERENCES);

import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

const CONFIRM = 'Confirmação com radiografia de tórax sempre recomendada.';

/**
 * Porte do `posiçãoCvc` do ANY. O valor é o código do sítio de acesso, não um
 * ponto; cada sítio é uma faixa com a profundidade de lá. O ANY usava o mesmo
 * rótulo ("Profundidade estimada") para todos; aqui o rótulo é o sítio.
 */
export const POSICAO_CVC: ClassificationCalculator = {
  kind: 'classification',
  id: 'posicao-cvc',
  name: 'Posicionamento de CVC',
  aliases: [
    'cvc',
    'cateter venoso central',
    'posição',
    'profundidade',
    'jugular',
    'subclavia',
    'femoral',
  ],
  category: 'Procedimentos',
  description: 'Profundidade estimada de inserção do cateter venoso central por sítio de acesso.',
  reference: {
    why: 'Previne complicações por posicionamento muito profundo (arritmia, perfuração) ou superficial (mau funcionamento).',
    whenToUse:
      'Durante a inserção do CVC, para estimar a profundidade ideal antes da confirmação radiológica.',
    pearlsPitfalls: [
      'Ponta ideal: junção cava superior–átrio direito (~T4–T5 na radiografia).',
      'Jugular interna direita: 12–15 cm. Jugular interna esquerda: 15–18 cm.',
      'Subclávia direita: 13–15 cm. Subclávia esquerda: 15–18 cm.',
      'Femoral: 20–25 cm (ponta na VCI infrarrenal para hemodiálise).',
      'Sempre confirmar a posição com radiografia de tórax pós-procedimento.',
      'A altura do paciente influencia: pacientes mais altos = profundidade maior.',
    ],
    citation:
      'Lum P. A new formula-based measurement guide for optimal positioning of central venous catheters. JAVA. 2004;9(2):80-5. Czepizak CA et al. Optimal depth of central venous catheter insertion. Chest. 1995;107(6):1662-4.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('site', 'Sítio de acesso', [
      ['jid', 'Jugular interna direita — 12–15 cm', 1],
      ['jie', 'Jugular interna esquerda — 15–18 cm', 2],
      ['scd', 'Subclávia direita — 13–15 cm', 3],
      ['sce', 'Subclávia esquerda — 15–18 cm', 4],
      ['femoral', 'Femoral — 20–25 cm (hemodiálise: ponta na VCI infrarrenal)', 5],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'jid',
        upTo: { value: 1, inclusive: true },
        label: 'Jugular interna direita: 12–15 cm',
        tone: 'neutral',
        action: `Ponta ideal na junção VCS-AD. ${CONFIRM}`,
      },
      {
        id: 'jie',
        upTo: { value: 2, inclusive: true },
        label: 'Jugular interna esquerda: 15–18 cm',
        tone: 'neutral',
        action: `Atravessa a veia braquiocefálica: mais longo que à direita. ${CONFIRM}`,
      },
      {
        id: 'scd',
        upTo: { value: 3, inclusive: true },
        label: 'Subclávia direita: 13–15 cm',
        tone: 'neutral',
        action: `Entrada pela veia subclávia direita. ${CONFIRM}`,
      },
      {
        id: 'sce',
        upTo: { value: 4, inclusive: true },
        label: 'Subclávia esquerda: 15–18 cm',
        tone: 'neutral',
        action: `Caminho mais longo, pela braquiocefálica esquerda. ${CONFIRM}`,
      },
    ],
    otherwise: {
      id: 'femoral',
      label: 'Femoral: 20–25 cm',
      tone: 'neutral',
      action: `Para hemodiálise: ponta na VCI infrarrenal. ${CONFIRM}`,
    },
  },
};

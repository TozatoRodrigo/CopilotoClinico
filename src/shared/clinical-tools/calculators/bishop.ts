import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `bishopScore` do ANY. Itens, pontos e faixas iguais (colo
 * desfavorável em vermelho, como lá). O id "posítion" do ANY virou "position".
 */
export const BISHOP: ScoreCalculator = {
  kind: 'score',
  id: 'bishop',
  name: 'Bishop Score',
  aliases: ['bishop', 'maturidade cervical', 'induçao', 'parto', 'cervix'],
  category: 'Obstetrícia',
  description: 'Avaliação da maturidade cervical para predição do sucesso da indução do parto.',
  reference: {
    why: 'Bishop ≥ 8 indica colo favorável, com alta probabilidade de parto vaginal espontâneo. Bishop < 6 pode necessitar preparo cervical.',
    whenToUse:
      'Antes de indicar a indução do trabalho de parto, para avaliar a maturidade cervical.',
    pearlsPitfalls: [
      'Bishop ≥ 8: colo favorável; indução com ocitocina geralmente suficiente.',
      'Bishop < 6: colo desfavorável; considere preparo cervical (misoprostol ou sonda de Foley).',
      'Avaliação subjetiva: existe variabilidade entre examinadores.',
      'Não prediz cesariana, apenas a probabilidade de sucesso da indução.',
    ],
    citation: 'Bishop EH. Pelvic scoring for elective induction. Obstet Gynecol. 1964;24:266-8.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('dilation', 'Dilatação cervical', [
      ['fechado', 'Fechado', 0],
      ['1-2', '1–2 cm', 1],
      ['3-4', '3–4 cm', 2],
      ['gte5', '≥ 5 cm', 3],
    ]),
    choiceItem('effacement', 'Esvaecimento', [
      ['0-30', '0–30%', 0],
      ['40-50', '40–50%', 1],
      ['60-70', '60–70%', 2],
      ['gte80', '≥ 80%', 3],
    ]),
    choiceItem('station', 'Plano de De Lee', [
      ['-3', '-3', 0],
      ['-2', '-2', 1],
      ['-1-0', '-1/0', 2],
      ['+1+2', '+1/+2', 3],
    ]),
    choiceItem('consistency', 'Consistência do colo', [
      ['firme', 'Firme', 0],
      ['medio', 'Médio', 1],
      ['amolecido', 'Amolecido', 2],
    ]),
    choiceItem('position', 'Posição do colo', [
      ['posterior', 'Posterior', 0],
      ['medio', 'Médio', 1],
      ['anterior', 'Anterior', 2],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'desfavoravel',
        upTo: { value: 6, inclusive: false },
        label: 'Colo desfavorável',
        tone: 'critical',
        action:
          'Bishop < 6. Considere preparo cervical antes da indução (misoprostol, sonda de Foley ou dilatadores osmóticos).',
      },
      {
        id: 'intermediario',
        upTo: { value: 8, inclusive: false },
        label: 'Colo intermediário',
        tone: 'attention',
        action: 'Bishop 6–7. A indução pode ser tentada; o preparo cervical pode beneficiar.',
      },
    ],
    otherwise: {
      id: 'favoravel',
      label: 'Colo favorável',
      tone: 'neutral',
      action: 'Bishop ≥ 8. Alta probabilidade de sucesso da indução com ocitocina.',
    },
  },
};

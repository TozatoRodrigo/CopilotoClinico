import type { ScoreCalculator } from '../calculator';
import { yesNoItem } from '../calculators/items';
import { TEP_PROVENANCE } from './provenance';

/**
 * Achados de disfunção de VD no eco à beira-leito do paciente instável, do
 * `TepGuide.tsx` do ANY (`ECO_ITEMS` e o resumo do modal): nenhum achado, 1–2
 * (disfunção presente) ou ≥ 3 (grave). As ações repetem o próprio ANY
 * (anticoagulação empírica e o limite do eco); a contagem como gravidade é
 * achado para a revisão clínica.
 */
export const ECHO_RV: ScoreCalculator = {
  kind: 'score',
  id: 'eco-vd',
  name: 'Eco à beira-leito — disfunção de VD',
  aliases: ['eco', 'pocus', 'vd', 'tapse', 'mcconnell'],
  category: 'Tromboembolismo pulmonar',
  description: 'Sete achados de disfunção de VD no eco do paciente instável.',
  reference: {
    why: 'O eco pode definir a conduta antes da CTPA no paciente instável.',
    whenToUse: 'Paciente com suspeita de TEP e instabilidade hemodinâmica.',
    pearlsPitfalls: [
      'A presença de disfunção de VD no eco não confirma TEP, mas estratifica risco em TEP confirmada.',
      'Eco à beira-leito não substitui CTPA para diagnóstico.',
    ],
    citation: 'Roteiro de TEP do ANY App (parâmetros de VD na referência rápida).',
  },
  provenance: TEP_PROVENANCE,
  items: [
    yesNoItem('rv-lv', 'VD/VE > 0,9'),
    yesNoItem('tapse', 'TAPSE < 16 mm'),
    yesNoItem('mcconnell', 'Sinal de McConnell'),
    yesNoItem('d-sign', 'D-sign (septo achatado)'),
    yesNoItem('thrombus', 'Trombo em câmaras direitas'),
    yesNoItem('tapse-pasp', 'TAPSE/PASP < 0,34'),
    yesNoItem('hypokinesia', 'Hipocinesia de VD'),
  ],
  formatValue: (value) => `${value} ${value === 1 ? 'achado' : 'achados'}`,
  interpretation: {
    bands: [
      {
        id: 'sem-disfuncao',
        upTo: { value: 0, inclusive: true },
        label: 'Eco sem sinais de disfunção de VD',
        tone: 'neutral',
        action: 'Eco à beira-leito não substitui CTPA para diagnóstico.',
      },
      {
        id: 'disfuncao',
        upTo: { value: 2, inclusive: true },
        label: 'Disfunção de VD presente',
        tone: 'attention',
        action: 'Se alta suspeita clínica, considere anticoagulação antes da confirmação por CTPA.',
      },
    ],
    otherwise: {
      id: 'disfuncao-grave',
      label: 'Disfunção grave de VD',
      tone: 'critical',
      action: 'Se alta suspeita clínica, considere anticoagulação antes da confirmação por CTPA.',
    },
  },
};

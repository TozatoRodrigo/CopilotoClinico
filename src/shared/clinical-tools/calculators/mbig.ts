import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/**
 * Porte do `mBig` do ANY. Vale a pior categoria: critério de mBIG 3 vale 100,
 * de mBIG 2 vale 1, e a soma só separa as faixas (a tela mostra a faixa).
 * Textos do ANY sem acento foram acentuados.
 */
export const MBIG: ScoreCalculator = {
  kind: 'score',
  id: 'mbig',
  name: 'mBIG — Modified Brain Injury Guidelines',
  aliases: [
    'mbig',
    'big',
    'brain injury guidelines',
    'tce',
    'hemorragia intracraniana',
    'hsd',
    'hed',
    'hsa',
    'trauma craniano',
  ],
  category: 'Trauma',
  description:
    'Estratifica o TCE leve COM hemorragia intracraniana já documentada na TC, definindo observação no DE, internação ou leito monitorado com neurocirurgia.',
  reference: {
    why: 'Reduz TC de controle, parecer de neurocirurgia e internações desnecessárias em sangramentos pequenos. Na validação multicêntrica da AAST, os critérios de mBIG 3 mostraram alta sensibilidade para necessidade de intervenção neurocirúrgica.',
    whenToUse:
      'Adulto com TCE, GCS 13–15 (ou basal) e hemorragia intracraniana na TC inicial. NÃO serve para decidir se a TC deve ser feita: para isso, use Canadian CT Head ou, em crianças, PECARN.',
    pearlsPitfalls: [
      'Pré-requisito: TC já realizada e com sangramento. Sem hemorragia, o escore não se aplica.',
      'Não é somatório: vale sempre a pior categoria. Um único critério de mBIG 3 define a conduta.',
      'Qualquer hematoma extradural e qualquer hemorragia intraventricular são mBIG 3, independentemente do tamanho.',
      'Uso de anticoagulante ou antiagregante (incluindo DOAC e heparina) é mBIG 3.',
      'Intoxicação permite mBIG 2, mas exige exame neurológico normal.',
      'Validado em adultos. Não há versão pediátrica validada: o kBIG é uma proposta recente, ainda sem validação.',
      'Medir o maior diâmetro do sangramento no corte axial.',
    ],
    citation:
      'Joseph B et al. The BIG (brain injury guidelines) project. J Trauma Acute Care Surg. 2014;76(4):965-9. Validação: Joseph B et al. Validating the Brain Injury Guidelines (BIG): AAST prospective multi-institutional trial. J Trauma Acute Care Surg. 2022.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('exame', 'Exame neurológico', [
      ['normal', 'Normal, GCS 13–15 ou basal', 0],
      ['anormal', 'Anormal: GCS < 13, déficit focal ou alteração pupilar', 100],
    ]),
    choiceItem('anticoag', 'Anticoagulante ou antiagregante (inclui DOAC e heparina)', [
      ['nao', 'Não', 0],
      ['sim', 'Sim', 100],
    ]),
    choiceItem('intox', 'Intoxicação', [
      ['nao', 'Não', 0],
      ['sim', 'Sim', 1],
    ]),
    choiceItem('fratura', 'Fratura de crânio', [
      ['ausente', 'Ausente', 0],
      ['nao-desviada', 'Não desviada', 1],
      ['desviada', 'Desviada', 100],
    ]),
    choiceItem('hsd_hip', 'Hematoma subdural ou hemorragia intraparenquimatosa (maior diâmetro)', [
      ['ate-4', 'Ausente ou até 4 mm', 0],
      ['5-7.9', '5 a 7,9 mm', 1],
      ['gte8', '8 mm ou mais', 100],
    ]),
    choiceItem('hsa', 'Hemorragia subaracnoidea', [
      ['traco', 'Ausente ou traço (até 3 sulcos, < 1 mm)', 0],
      ['um-hemisferio', 'Um hemisfério, 1 a 3 mm', 1],
      ['bi-hemisferica', 'Bi-hemisférica ou > 3 mm', 100],
    ]),
    choiceItem('hed', 'Hematoma extradural', [
      ['ausente', 'Ausente', 0],
      ['presente', 'Presente (qualquer tamanho)', 100],
    ]),
    choiceItem('hiv', 'Hemorragia intraventricular', [
      ['ausente', 'Ausente', 0],
      ['presente', 'Presente', 100],
    ]),
    choiceItem('multiplos', 'Múltiplos focos de sangramento ou desvio de linha média', [
      ['nao', 'Não', 0],
      ['sim', 'Sim', 100],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'mbig1',
        upTo: { value: 0, inclusive: true },
        label: 'mBIG 1 — baixo risco',
        tone: 'neutral',
        action:
          'Considere observação de 6 h no DE com avaliação neurológica a cada 2 h. TC de controle e parecer de neurocirurgia geralmente não necessários. Alta do DE se mantiver estabilidade.',
      },
      {
        id: 'mbig2',
        upTo: { value: 100, inclusive: false },
        label: 'mBIG 2 — risco moderado',
        tone: 'attention',
        action:
          'Considere internação por 24 a 48 h com avaliação neurológica a cada 2 h nas primeiras 6 h e depois a cada 4 h. TC de controle e parecer de neurocirurgia geralmente não necessários sem piora clínica.',
      },
    ],
    otherwise: {
      id: 'mbig3',
      label: 'mBIG 3 — alto risco',
      tone: 'critical',
      action:
        'Considere leito monitorado (UTI ou unidade neurocrítica), parecer de neurocirurgia e TC de controle.',
    },
  },
};

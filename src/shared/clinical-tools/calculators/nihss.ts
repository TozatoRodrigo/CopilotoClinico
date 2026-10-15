import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, type OptionTuple } from './items';

const UPPER_LIMB: readonly OptionTuple[] = [
  ['0', 'Sem queda em 10 s', 0],
  ['1', 'Queda parcial antes de 10 s', 1],
  ['2', 'Algum esforço contra a gravidade, mas não sustenta', 2],
  ['3', 'Sem esforço contra a gravidade', 3],
  ['4', 'Sem movimento', 4],
];

const LOWER_LIMB: readonly OptionTuple[] = [
  ['0', 'Sem queda em 5 s', 0],
  ['1', 'Queda parcial antes de 5 s', 1],
  ['2', 'Algum esforço contra a gravidade', 2],
  ['3', 'Sem esforço contra a gravidade', 3],
  ['4', 'Sem movimento', 4],
];

/** Porte do `nihss` do ANY. Os 15 itens, pontos e faixas iguais; ações como sugestão. */
export const NIHSS: ScoreCalculator = {
  kind: 'score',
  id: 'nihss',
  name: 'NIHSS',
  aliases: [
    'nihss',
    'avc',
    'acidente vascular cerebral',
    'stroke',
    'escala de avc',
    'gravidade avc',
  ],
  category: 'Neurologia',
  description: 'Quantifica a gravidade do déficit neurológico no AVC agudo.',
  reference: {
    why: 'Padrão-ouro para quantificar a gravidade do AVC. Guia a decisão de trombólise e de trombectomia mecânica.',
    whenToUse:
      'Todo paciente com suspeita de AVC agudo, antes e após o tratamento, e para monitorar a evolução.',
    pearlsPitfalls: [
      'NIHSS ≥ 6 com oclusão de grande vaso = considerar trombectomia mecânica.',
      'O NIHSS pode subestimar o AVC de circulação posterior (vertebrobasilar).',
      'Afasia eleva desproporcionalmente o escore: não assumir que NIHSS alto = déficit motor grave.',
      'Avaliar e pontuar o que o paciente FAZ, não o que você acha que ele pode fazer.',
      'Escore 0 não exclui AVC: AVCs lacunares podem ter NIHSS normal.',
    ],
    citation:
      'Brott T et al. Measurements of acute cerebral infarction: a clinical examination scale. Stroke. 1989;20(7):864-70.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('1a', '1a. Nível de consciência', [
      ['0', 'Alerta', 0],
      ['1', 'Não alerta, despertável com estímulo mínimo', 1],
      ['2', 'Não alerta, requer estimulação repetida', 2],
      ['3', 'Coma / sem resposta', 3],
    ]),
    choiceItem('1b', '1b. Perguntas de orientação (mês e idade)', [
      ['0', 'Ambas corretas', 0],
      ['1', 'Uma correta', 1],
      ['2', 'Nenhuma correta', 2],
    ]),
    choiceItem('1c', '1c. Comandos (abrir/fechar olhos, apertar/soltar a mão)', [
      ['0', 'Ambos corretos', 0],
      ['1', 'Um correto', 1],
      ['2', 'Nenhum correto', 2],
    ]),
    choiceItem('2', '2. Olhar conjugado', [
      ['0', 'Normal', 0],
      ['1', 'Paralisia parcial do olhar', 1],
      ['2', 'Desvio forçado do olhar', 2],
    ]),
    choiceItem('3', '3. Campo visual', [
      ['0', 'Sem perda visual', 0],
      ['1', 'Hemianopsia parcial', 1],
      ['2', 'Hemianopsia completa', 2],
      ['3', 'Cegueira bilateral', 3],
    ]),
    choiceItem('4', '4. Paralisia facial', [
      ['0', 'Normal', 0],
      ['1', 'Paralisia mínima (apagamento do sulco nasolabial)', 1],
      ['2', 'Paralisia parcial (face inferior)', 2],
      ['3', 'Paralisia completa (face superior e inferior)', 3],
    ]),
    choiceItem(
      '5a',
      '5a. Motor do membro superior esquerdo (90 graus sentado / 45 supino)',
      UPPER_LIMB,
    ),
    choiceItem('5b', '5b. Motor do membro superior direito', UPPER_LIMB),
    choiceItem('6a', '6a. Motor do membro inferior esquerdo (30 graus supino)', LOWER_LIMB),
    choiceItem('6b', '6b. Motor do membro inferior direito', LOWER_LIMB),
    choiceItem('7', '7. Ataxia de membros', [
      ['0', 'Ausente', 0],
      ['1', 'Presente em 1 membro', 1],
      ['2', 'Presente em 2 membros', 2],
    ]),
    choiceItem('8', '8. Sensibilidade', [
      ['0', 'Normal', 0],
      ['1', 'Hipoestesia leve a moderada', 1],
      ['2', 'Anestesia', 2],
    ]),
    choiceItem('9', '9. Linguagem (afasia)', [
      ['0', 'Sem afasia', 0],
      ['1', 'Afasia leve a moderada', 1],
      ['2', 'Afasia grave', 2],
      ['3', 'Mutismo / afasia global', 3],
    ]),
    choiceItem('10', '10. Disartria', [
      ['0', 'Normal', 0],
      ['1', 'Disartria leve a moderada', 1],
      ['2', 'Anartria / ininteligível', 2],
    ]),
    choiceItem('11', '11. Extinção / inatenção', [
      ['0', 'Sem anormalidade', 0],
      ['1', 'Inatenção em uma modalidade', 1],
      ['2', 'Hemi-inatenção profunda ou em mais de uma modalidade', 2],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'sem-deficit',
        upTo: { value: 0, inclusive: true },
        label: 'Sem déficit',
        tone: 'neutral',
        action: 'NIHSS 0. Considere que AVC lacunar pode ter NIHSS normal.',
      },
      {
        id: 'menor',
        upTo: { value: 4, inclusive: true },
        label: 'Déficit menor',
        tone: 'neutral',
        action: 'AVC menor. Trombólise pode não ser indicada se o déficit não for incapacitante.',
      },
      {
        id: 'moderado',
        upTo: { value: 15, inclusive: true },
        label: 'Déficit moderado',
        tone: 'attention',
        action:
          'AVC moderado. Considere trombólise IV; se houver oclusão de grande vaso, considere trombectomia.',
      },
      {
        id: 'moderado-grave',
        upTo: { value: 20, inclusive: true },
        label: 'Déficit moderado-grave',
        tone: 'critical',
        action:
          'AVC grave. Trombólise IV e trombectomia mecânica fortemente recomendadas se dentro da janela.',
      },
    ],
    otherwise: {
      id: 'grave',
      label: 'Déficit grave',
      tone: 'critical',
      action:
        'AVC muito grave. Considere trombólise IV com ou sem trombectomia. Prognóstico reservado; risco de transformação hemorrágica.',
    },
  },
};

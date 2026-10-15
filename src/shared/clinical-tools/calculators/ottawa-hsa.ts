import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { criteriaCount, yesNoItem } from './items';

/**
 * Porte do `ottawaHsa` do ANY. Critérios e faixas iguais; a ação da faixa
 * positiva passou para a forma de sugestão.
 */
export const OTTAWA_HSA: ScoreCalculator = {
  kind: 'score',
  id: 'ottawa-hsa',
  name: 'Ottawa SAH Rule',
  aliases: [
    'ottawa',
    'hsa',
    'cefaleia',
    'thunderclap',
    'hemorragia subaracnoidea',
    'regra de ottawa',
  ],
  category: 'Neurologia',
  description: 'Critérios para exclusão de HSA em cefaleia aguda não traumática no DE.',
  reference: {
    why: 'Sensibilidade de 100% para HSA quando todos os critérios são negativos, potencialmente evitando punção lombar.',
    whenToUse:
      'Pacientes alertas (GCS 15) com cefaleia aguda não traumática que atinge a intensidade máxima em 1 hora.',
    pearlsPitfalls: [
      'Só aplicável se GCS 15 e cefaleia aguda não traumática.',
      'QUALQUER critério positivo = investigar (TC + punção lombar ou angioTC).',
      'Todos negativos = sensibilidade 100% para HSA (VPN elevadíssimo).',
      'Não validada para cefaleias crônicas ou traumáticas.',
      'Idade ≥ 40 anos é um critério: não significa que todos com ≥ 40 anos têm HSA.',
    ],
    citation:
      'Perry JJ et al. Clinical decision rules to rule out subarachnoid hemorrhage for acute headache. JAMA. 2013;310(12):1248-55.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('age40', 'Idade ≥ 40 anos'),
    yesNoItem('neck', 'Dor ou rigidez cervical'),
    yesNoItem('witness', 'Perda de consciência presenciada'),
    yesNoItem('onset', 'Início durante esforço físico'),
    yesNoItem('thunderclap', 'Cefaleia "thunderclap" (intensidade máxima instantânea)'),
    yesNoItem('flexion', 'Limitação da flexão cervical ao exame'),
  ],
  formatValue: criteriaCount,
  interpretation: {
    bands: [
      {
        id: 'negativo',
        upTo: { value: 0, inclusive: true },
        label: 'Todos os critérios negativos',
        tone: 'neutral',
        action:
          'Sensibilidade ~100% para excluir HSA. Investigação adicional pode não ser necessária se a clínica for compatível.',
      },
    ],
    otherwise: {
      id: 'positivo',
      label: 'Pelo menos 1 critério positivo',
      tone: 'critical',
      action:
        'HSA não pode ser excluída clinicamente. Considere investigar com TC de crânio, com ou sem punção lombar, ou angioTC.',
    },
  },
};

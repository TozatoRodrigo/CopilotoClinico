import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { criteriaCount, yesNoItem } from './items';

/**
 * Porte do `percRule` do ANY. Critérios e faixas iguais; a contagem de
 * critérios positivos aparece como valor e a ação positiva virou sugestão.
 */
export const PERC_RULE: ScoreCalculator = {
  kind: 'score',
  id: 'perc-rule',
  name: 'PERC Rule',
  aliases: ['perc', 'tep', 'embolia pulmonar', 'tromboembolismo', 'd-dimero', 'exclusao'],
  category: 'Vascular',
  description:
    'Exclui tromboembolismo pulmonar sem necessidade de D-dímero quando todos os critérios são negativos.',
  reference: {
    why: 'Em pacientes com probabilidade pré-teste baixa, PERC totalmente negativo exclui TEP sem D-dímero.',
    whenToUse:
      'Pacientes com suspeita de TEP e probabilidade pré-teste baixa (Wells < 2 ou gestalt < 15%).',
    pearlsPitfalls: [
      'TODOS os 8 critérios devem ser negativos para excluir TEP.',
      'Qualquer critério positivo = não passa no PERC: solicitar D-dímero.',
      'Só aplicar em pacientes com probabilidade pré-teste BAIXA.',
      'Não usar em pacientes com alta probabilidade clínica de TEP.',
      'Sensibilidade ~97%. Taxa de TEP perdido < 2% (aceitável clinicamente).',
    ],
    citation:
      'Kline JA et al. Clinical criteria to prevent unnecessary diagnostic testing in emergency department patients with suspected pulmonary embolism. J Thromb Haemost. 2004;2(8):1247-55.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('age', 'Idade ≥ 50 anos'),
    yesNoItem('hr', 'FC ≥ 100 bpm'),
    yesNoItem('spo2', 'SpO₂ < 95% em ar ambiente'),
    yesNoItem('hemoptysis', 'Hemoptise'),
    yesNoItem('estrogen', 'Uso de estrogênio'),
    yesNoItem('surgery', 'Cirurgia ou trauma com hospitalização nas últimas 4 semanas'),
    yesNoItem('dvt', 'História de TVP ou TEP prévio'),
    yesNoItem('leg', 'Edema unilateral de membro inferior'),
  ],
  formatValue: criteriaCount,
  interpretation: {
    bands: [
      {
        id: 'negativo',
        upTo: { value: 0, inclusive: true },
        label: 'PERC negativo — TEP excluído',
        tone: 'neutral',
        action:
          'Todos os 8 critérios negativos. Em paciente com baixa probabilidade pré-teste, TEP pode ser excluído sem D-dímero. Risco residual < 2%.',
      },
    ],
    otherwise: {
      id: 'positivo',
      label: 'PERC positivo',
      tone: 'attention',
      action: 'PERC não exclui TEP. Considere D-dímero e, se positivo, angioTC.',
    },
  },
};

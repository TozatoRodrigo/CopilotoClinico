import type { ScoreCalculator } from '../calculator';
import { yesNoItem } from '../calculators/items';
import { TEP_PROVENANCE } from './provenance';

/**
 * Wells para TEP, do `TepGuide.tsx` do ANY (`WELLS_ITEMS`): mesmos itens e
 * pontos, mesmas faixas (< 2, 2–6, > 6) e o Wells modificado (> 4) como linha
 * secundária. As ações vêm do roteiro do ANY e do `classifyWells` de
 * calculations.ts (PERC → D-dímero; D-dímero; imagem direta).
 */

/** Wells modificado, em dois níveis: o ANY mostra "provável" acima de 4. */
export function wellsModifiedLikely(score: number): boolean {
  return score > 4;
}

export const WELLS_TEP: ScoreCalculator = {
  kind: 'score',
  id: 'wells-tep',
  name: 'Wells para TEP',
  aliases: ['wells', 'tep', 'embolia pulmonar', 'probabilidade pré-teste'],
  category: 'Tromboembolismo pulmonar',
  description: 'Probabilidade pré-teste de TEP: baixa, intermediária ou alta.',
  reference: {
    why: 'A probabilidade pré-teste decide o próximo passo: PERC e D-dímero na baixa, D-dímero na intermediária, imagem direta na alta.',
    whenToUse:
      'Suspeita de TEP em paciente estável fora da gestação (na gestante, o roteiro usa o YEARS adaptado).',
    pearlsPitfalls: [
      'Wells modificado: > 4 = TEP provável; ≤ 4 = TEP improvável.',
      'Alta probabilidade (> 6): imagem recomendada sem necessidade de D-dímero.',
    ],
    citation:
      'Wells PS, Anderson DR, Rodger M, et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism: increasing the models utility with the SimpliRED D-dimer. Thromb Haemost. 2000;83(3):416-20.',
  },
  provenance: TEP_PROVENANCE,
  items: [
    yesNoItem('dvt-signs', 'Sinais clínicos de TVP', 3),
    yesNoItem('pe-likely', 'TEP mais provável que outros diagnósticos', 3),
    yesNoItem('hr', 'FC > 100 bpm', 1.5),
    yesNoItem('immobilization', 'Imobilização (≥ 3 dias) ou cirurgia nas últimas 4 semanas', 1.5),
    yesNoItem('previous', 'TVP ou TEP prévios', 1.5),
    yesNoItem('hemoptysis', 'Hemoptise', 1),
    yesNoItem('cancer', 'Câncer ativo', 1),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixa',
        upTo: { value: 2, inclusive: false },
        label: 'Baixa probabilidade (< 2)',
        tone: 'neutral',
        action: 'Considere PERC (se gestalt < 15%) e, se positivo, D-dímero.',
      },
      {
        id: 'intermediaria',
        upTo: { value: 6, inclusive: true },
        label: 'Probabilidade intermediária (2–6)',
        tone: 'attention',
        action: 'Considere D-dímero.',
      },
    ],
    otherwise: {
      id: 'alta',
      label: 'Alta probabilidade (> 6)',
      tone: 'critical',
      action:
        'Imagem recomendada sem necessidade de D-dímero: CTPA (preferida) ou V/Q se contraindicação a contraste iodado.',
    },
  },
  details: (value) => [
    {
      label: 'Wells modificado',
      value: wellsModifiedLikely(value) ? 'TEP provável (> 4)' : 'TEP improvável (≤ 4)',
    },
  ],
};

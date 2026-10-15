import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { yesNoItem } from './items';

/**
 * Porte do `alvaradoScore` do ANY (MANTRELS). Itens, pontos e faixas iguais.
 * O id "náusea" do ANY virou "nausea" (sem acento, como todo id).
 */
export const ALVARADO: ScoreCalculator = {
  kind: 'score',
  id: 'alvarado',
  name: 'Alvarado Score',
  aliases: ['alvarado', 'mantrels', 'apendicite', 'dor abdominal', 'fossa ilíaca direita'],
  category: 'Gastro / Hepato',
  description: 'Probabilidade de apendicite aguda baseada em critérios clínicos e laboratoriais.',
  reference: {
    why: 'Auxilia a triagem de pacientes com dor abdominal para investigação de apendicite.',
    whenToUse:
      'Pacientes com dor abdominal sugestiva de apendicite, para guiar a solicitação de imagem.',
    pearlsPitfalls: [
      'MANTRELS: Migration, Anorexia, Nausea, Tenderness RLQ, Rebound, Elevation temp, Leukocytosis, Shift left.',
      'Escore ≤ 4: apendicite improvável. Escore 5–6: possível (considere imagem). Escore ≥ 7: provável.',
      'Não substitui a imagem (TC ou ultrassom) em casos duvidosos.',
      'A sensibilidade varia conforme a população: menor em mulheres e idosos.',
      'Escore 9–10 tem valor preditivo positivo > 90%.',
    ],
    citation:
      'Alvarado A. A practical score for the early diagnosis of acute appendicitis. Ann Emerg Med. 1986;15(5):557-64.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('migration', 'Migração da dor para a fossa ilíaca direita'),
    yesNoItem('anorexia', 'Anorexia'),
    yesNoItem('nausea', 'Náusea ou vômitos'),
    yesNoItem('tenderness', 'Dor à palpação em fossa ilíaca direita', 2),
    yesNoItem('rebound', 'Descompressão brusca dolorosa (Blumberg)'),
    yesNoItem('temp', 'Temperatura ≥ 37,3 graus Celsius'),
    yesNoItem('leukocytosis', 'Leucocitose (> 10.000/mm³)', 2),
    yesNoItem('shift', 'Desvio à esquerda (neutrofilia > 75%)'),
  ],
  interpretation: {
    bands: [
      {
        id: 'improvavel',
        upTo: { value: 4, inclusive: true },
        label: 'Apendicite improvável',
        tone: 'neutral',
        action:
          'Escore ≤ 4. Probabilidade baixa de apendicite. Considere diagnósticos alternativos e observação.',
      },
      {
        id: 'possivel',
        upTo: { value: 6, inclusive: true },
        label: 'Apendicite possível',
        tone: 'attention',
        action:
          'Escore 5–6. Probabilidade moderada. Considere TC de abdome ou ultrassom para confirmar.',
      },
      {
        id: 'provavel',
        upTo: { value: 8, inclusive: true },
        label: 'Apendicite provável',
        tone: 'critical',
        action:
          'Escore 7–8. Alta probabilidade. Considere avaliação cirúrgica e imagem confirmatória.',
      },
    ],
    otherwise: {
      id: 'muito-provavel',
      label: 'Apendicite muito provável',
      tone: 'critical',
      action: 'Escore 9–10. Probabilidade > 90%. Avaliação cirúrgica recomendada.',
    },
  },
};

import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Porte do `heartScore` do ANY. Conta, faixas e ações iguais; só acentuação corrigida. */
export const HEART_SCORE: ScoreCalculator = {
  kind: 'score',
  id: 'heart-score',
  name: 'HEART Score',
  aliases: ['heart', 'sca', 'síndrome coronariana', 'dor torácica', 'chest pain'],
  category: 'Cardiologia / SCA',
  description: 'Estratificação de risco em síndrome coronariana aguda na emergência.',
  reference: {
    why: 'Desenvolvido especificamente para estratificar dor torácica no departamento de emergência, superando TIMI e GRACE nesse contexto.',
    whenToUse:
      'Pacientes com dor torácica sugestiva de SCA no DE. Não usar em pacientes com IAMCSST óbvio.',
    pearlsPitfalls: [
      'O componente "History" é o mais subjetivo: considere se a história é altamente, moderadamente ou levemente sugestiva de SCA.',
      'A troponina deve ser interpretada conforme o ensaio local (convencional ou de alta sensibilidade).',
      'Escore ≤ 3 com troponina negativa seriada tem valor preditivo negativo > 99%.',
      'Não substitui o julgamento clínico em apresentações atípicas.',
    ],
    citation:
      'Six AJ et al. Chest pain in the emergency room: value of the HEART score. Neth Heart J. 2008;16(6):191-6.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('history', 'História clínica', [
      ['leve', 'Levemente suspeita', 0],
      ['moderada', 'Moderadamente suspeita', 1],
      ['alta', 'Altamente suspeita', 2],
    ]),
    choiceItem('ecg', 'ECG', [
      ['normal', 'Normal', 0],
      ['inespecifica', 'Alteração inespecífica de repolarização', 1],
      ['st', 'Desvio significativo de ST', 2],
    ]),
    choiceItem('age', 'Idade', [
      ['lt45', '< 45 anos', 0],
      ['45-64', '45–64 anos', 1],
      ['gte65', '≥ 65 anos', 2],
    ]),
    choiceItem('risk', 'Fatores de risco', [
      ['nenhum', 'Nenhum fator de risco conhecido', 0],
      [
        '1-2',
        '1–2 fatores de risco (HAS, DM, tabagismo, dislipidemia, obesidade, história familiar)',
        1,
      ],
      ['gte3', '≥ 3 fatores de risco ou história de DAC', 2],
    ]),
    choiceItem('troponin', 'Troponina', [
      ['normal', 'Normal (≤ 1x LSN)', 0],
      ['1-3x', '1–3x o limite superior da normalidade', 1],
      ['gt3x', '> 3x o limite superior da normalidade', 2],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 3, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action: 'MACE em 6 semanas: 0,9–1,7%. Considere alta precoce com seguimento ambulatorial.',
      },
      {
        id: 'moderado',
        upTo: { value: 6, inclusive: true },
        label: 'Risco moderado',
        tone: 'attention',
        action:
          'MACE em 6 semanas: 12–16,6%. Considere observação, troponina seriada e avaliação complementar.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action: 'MACE em 6 semanas: 50–65%. Considere internação e estratificação invasiva precoce.',
    },
  },
};

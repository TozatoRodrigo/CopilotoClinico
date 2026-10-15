import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, yesNoItem } from './items';

/**
 * Porte do `tash` do ANY. Itens, pontos e faixas iguais. A ação da faixa
 * alta dizia "ativar … imediatamente"; virou sugestão sem demora (ADR-017).
 */
export const TASH: ScoreCalculator = {
  kind: 'score',
  id: 'tash',
  name: 'TASH Score',
  aliases: ['tash', 'transfusão maciça', 'trauma', 'hemorragia', 'choque hemorragico'],
  category: 'Trauma',
  description: 'Probabilidade de necessidade de transfusão maciça no trauma.',
  reference: {
    why: 'Permite a ativação precoce do protocolo de transfusão maciça, reduzindo a mortalidade.',
    whenToUse: 'Pacientes com trauma grave e suspeita de hemorragia significativa.',
    pearlsPitfalls: [
      'Escore ≥ 16 = probabilidade > 50% de necessidade de transfusão maciça.',
      'Considere ativar o protocolo de transfusão maciça com escore ≥ 15.',
      'Inclui dados clínicos e laboratoriais simples disponíveis na admissão.',
      'A sensibilidade aumenta se combinado com avaliação clínica (ABC score).',
      'Pontuação de 0 a 31. Base excess e hemoglobina são graduados por faixa: usar o pior valor da admissão.',
    ],
    citation:
      'Yucel N et al. Trauma Associated Severe Hemorrhage (TASH)-Score: probability of mass transfusion as surrogate for life threatening hemorrhage after multiple trauma. J Trauma. 2006;60(6):1228-36.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('sbp', 'Pressão arterial sistólica', [
      ['gte120', '≥ 120 mmHg', 0],
      ['100-119', '100–119 mmHg', 1],
      ['lt100', '< 100 mmHg', 4],
    ]),
    choiceItem('hb', 'Hemoglobina', [
      ['gte12', '≥ 12 g/dL', 0],
      ['lt12', '< 12 g/dL', 2],
      ['lt11', '< 11 g/dL', 3],
      ['lt10', '< 10 g/dL', 4],
      ['lt9', '< 9 g/dL', 6],
      ['lt7', '< 7 g/dL', 8],
    ]),
    choiceItem('fast', 'Líquido livre intra-abdominal (FAST)', [
      ['negativo', 'Negativo', 0],
      ['positivo', 'Positivo', 3],
    ]),
    yesNoItem('fracture', 'Fratura instável de pelve', 6),
    yesNoItem('hr', 'Frequência cardíaca ≥ 120 bpm', 2),
    choiceItem('be', 'Base excess', [
      ['gte-2', '≥ -2 mmol/L', 0],
      ['lt-2', '< -2 mmol/L', 1],
      ['lt-6', '< -6 mmol/L', 3],
      ['lt-10', '< -10 mmol/L', 4],
    ]),
    yesNoItem('femur', 'Fratura de fêmur aberta ou luxada', 3),
    choiceItem('sex', 'Sexo masculino', [
      ['feminino', 'Feminino', 0],
      ['masculino', 'Masculino', 1],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixa',
        upTo: { value: 10, inclusive: false },
        label: 'Baixa probabilidade',
        tone: 'neutral',
        action:
          'Probabilidade de transfusão maciça < 10%. Considere manter monitoramento e reposição padrão.',
      },
      {
        id: 'moderada',
        upTo: { value: 16, inclusive: false },
        label: 'Probabilidade moderada',
        tone: 'attention',
        action:
          'Probabilidade de transfusão maciça 10–50%. Considere reservar hemocomponentes e ativar o protocolo.',
      },
    ],
    otherwise: {
      id: 'alta',
      label: 'Alta probabilidade',
      tone: 'critical',
      action:
        'Probabilidade de transfusão maciça > 50%. Considere ativar o protocolo de transfusão maciça sem demora.',
    },
  },
};

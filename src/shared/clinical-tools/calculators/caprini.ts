import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, yesNoItem } from './items';

/**
 * Porte do `caprini` do ANY (15 dos fatores do Caprini). Pontos e faixas
 * iguais; as ações passaram para a forma de sugestão.
 */
export const CAPRINI: ScoreCalculator = {
  kind: 'score',
  id: 'caprini',
  name: 'Caprini Score',
  aliases: ['caprini', 'tev', 'tvp', 'trombose venosa', 'profilaxia', 'tromboprofilaxia'],
  category: 'Vascular',
  description: 'Risco de tromboembolismo venoso em pacientes cirúrgicos para guiar profilaxia.',
  reference: {
    why: 'Estratifica pacientes cirúrgicos para definir o tipo e a duração da tromboprofilaxia.',
    whenToUse: 'Pacientes cirúrgicos (pré ou pós-operatório), para decidir sobre tromboprofilaxia.',
    pearlsPitfalls: [
      'Escore 0–1: deambulação precoce. Escore 2: profilaxia mecânica (meias ou compressão). Escore 3–4: farmacológica. Escore ≥ 5: farmacológica estendida.',
      'Cada fator pontua de 1 a 5 pontos conforme a gravidade.',
      'Incluir comorbidades, tipo de cirurgia, mobilidade e história prévia.',
      'Profilaxia estendida (4 semanas) em cirurgias oncológicas de grande porte.',
    ],
    citation:
      'Caprini JA. Thrombosis risk assessment as a guide to quality patient care. Dis Mon. 2005;51(2-3):70-8.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('age', 'Idade', [
      ['lt41', '< 41 anos', 0],
      ['41-60', '41–60 anos', 1],
      ['61-74', '61–74 anos', 2],
      ['gte75', '≥ 75 anos', 3],
    ]),
    choiceItem('surgery', 'Tipo de cirurgia', [
      ['menor', 'Sem cirurgia / cirurgia menor', 0],
      ['grande', 'Cirurgia de grande porte (> 45 min)', 2],
      [
        'artroplastia',
        'Cirurgia de grande porte (> 45 min) com artroplastia ou fratura de quadril/pelve/perna',
        5,
      ],
    ]),
    choiceItem('immobility', 'Imobilidade', [
      ['deambulando', 'Deambulando', 0],
      ['leito', 'Restrição ao leito > 72 h', 2],
    ]),
    yesNoItem('bmi', 'IMC > 25'),
    yesNoItem('vte_hx', 'História de TVP/TEP', 3),
    yesNoItem('family', 'História familiar de TEV', 3),
    yesNoItem('cancer', 'Neoplasia ativa', 2),
    yesNoItem('varicose', 'Varizes de membros inferiores'),
    yesNoItem('pregnancy', 'Gestação ou puerpério'),
    yesNoItem('sepsis', 'Sepse (< 1 mês)'),
    yesNoItem('pneumonia', 'Doença pulmonar grave (incluindo pneumonia < 1 mês)'),
    yesNoItem('chf', 'ICC (< 1 mês)'),
    yesNoItem('iam', 'IAM (< 1 mês)'),
    yesNoItem('stroke', 'AVC (< 1 mês)', 5),
    yesNoItem('cvc', 'Acesso venoso central', 2),
  ],
  interpretation: {
    bands: [
      {
        id: 'muito-baixo',
        upTo: { value: 1, inclusive: true },
        label: 'Risco muito baixo',
        tone: 'neutral',
        action:
          'TEV em 60 dias: < 0,5%. Deambulação precoce. Profilaxia farmacológica geralmente desnecessária.',
      },
      {
        id: 'baixo',
        upTo: { value: 2, inclusive: true },
        label: 'Risco baixo',
        tone: 'neutral',
        action: 'TEV em 60 dias: ~1,5%. Considere profilaxia mecânica (meias compressivas ou CPI).',
      },
      {
        id: 'moderado',
        upTo: { value: 4, inclusive: true },
        label: 'Risco moderado',
        tone: 'attention',
        action:
          'TEV em 60 dias: ~3%. Considere profilaxia farmacológica (heparina ou HBPM) associada à mecânica.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Risco alto',
      tone: 'critical',
      action:
        'TEV em 60 dias: ~6%. Considere profilaxia farmacológica e mecânica. Escore ≥ 5 com cirurgia oncológica: considere profilaxia estendida (4 semanas).',
    },
  },
};

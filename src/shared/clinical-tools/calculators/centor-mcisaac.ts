import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, yesNoItem } from './items';

/** Porte do `centorMcisaac` do ANY. Itens (com o ajuste por idade), pontos e faixas iguais. */
export const CENTOR_MCISAAC: ScoreCalculator = {
  kind: 'score',
  id: 'centor-mcisaac',
  name: 'Centor/McIsaac',
  aliases: [
    'centor',
    'mcisaac',
    'faringite',
    'amigdalite',
    'dor de garganta',
    'streptococcus',
    'teste rápido',
  ],
  category: 'Infecção',
  description: 'Probabilidade de faringite estreptocócica e indicação de teste ou tratamento.',
  reference: {
    why: 'Reduz o uso desnecessário de antibióticos na faringite, orientando a solicitação de teste rápido ou cultura.',
    whenToUse:
      'Pacientes com faringite aguda, para decidir entre tratamento empírico, teste rápido ou observação.',
    pearlsPitfalls: [
      '0–1 ponto: risco de Strep A < 10%. Não testar, não tratar.',
      '2–3 pontos: risco de 15–30%. Considere teste rápido; tratar se positivo.',
      '4–5 pontos: risco de 50–60%. Considere tratamento empírico ou teste rápido.',
      'McIsaac adicionou ajuste por idade (bônus < 15 anos, penalidade ≥ 45 anos).',
      'Antibiótico de escolha: penicilina V ou amoxicilina por 10 dias.',
    ],
    citation:
      'McIsaac WJ et al. A clinical score to reduce unnecessary antibiotic use in patients with sore throat. CMAJ. 1998;158(1):75-83.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('temp', 'Temperatura ≥ 38 graus Celsius'),
    choiceItem('cough', 'Ausência de tosse', [
      ['tosse', 'Tosse presente', 0],
      ['sem-tosse', 'Sem tosse', 1],
    ]),
    yesNoItem('nodes', 'Linfonodos cervicais anteriores dolorosos e aumentados'),
    yesNoItem('exudate', 'Exsudato ou edema amigdaliano'),
    choiceItem('age', 'Idade (ajuste de McIsaac)', [
      ['3-14', '3–14 anos (+1)', 1],
      ['15-44', '15–44 anos (0)', 0],
      ['gte45', '≥ 45 anos (-1)', -1],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'muito-baixo',
        upTo: { value: 0, inclusive: true },
        label: 'Risco muito baixo',
        tone: 'neutral',
        action:
          'Probabilidade de Strep A < 5%. Teste rápido e antibiótico geralmente desnecessários. Tratamento sintomático.',
      },
      {
        id: 'baixo',
        upTo: { value: 1, inclusive: true },
        label: 'Risco baixo',
        tone: 'neutral',
        action:
          'Probabilidade de Strep A ~5–10%. Teste rápido e antibiótico geralmente desnecessários.',
      },
      {
        id: 'moderado',
        upTo: { value: 3, inclusive: true },
        label: 'Risco moderado',
        tone: 'attention',
        action:
          'Probabilidade de Strep A ~15–30%. Considere teste rápido; tratar apenas se positivo.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Risco alto',
      tone: 'critical',
      action:
        'Probabilidade de Strep A ~50–60%. Considere tratamento empírico com penicilina ou amoxicilina, ou teste rápido antes.',
    },
  },
};

import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { yesNoItem } from './items';

/**
 * Porte do `curb65` do ANY. A ação da faixa alta do ANY muda o texto pela
 * pontuação (3 → ~22%, ≥ 4 → > 30%); aqui isso virou duas faixas com o mesmo
 * rótulo e tom, para o texto ficar como dado.
 */
export const CURB65: ScoreCalculator = {
  kind: 'score',
  id: 'curb65',
  name: 'CURB-65',
  aliases: [
    'curb',
    'pneumonia',
    'pac',
    'pneumonia adquirida na comunidade',
    'mortalidade pneumonia',
  ],
  category: 'Respiratório / Sepse',
  description: 'Gravidade de pneumonia adquirida na comunidade e local de tratamento.',
  reference: {
    why: 'Rápido, sem laboratório complexo. Guia a decisão entre tratamento ambulatorial, internação e UTI.',
    whenToUse: 'Pacientes com pneumonia adquirida na comunidade no departamento de emergência.',
    pearlsPitfalls: [
      'CURB-65: Confusion, Urea > 42 mg/dL, Respiratory rate ≥ 30, Blood pressure (PAS < 90 ou PAD ≤ 60), ≥ 65 anos.',
      'CRB-65 (sem ureia) pode ser usado na atenção primária.',
      'Escore 0–1: tratamento ambulatorial. Escore 2: internação curta. Escore ≥ 3: UTI.',
      'Não avalia comorbidades nem fatores sociais; o julgamento clínico é sempre necessário.',
    ],
    citation:
      'Lim WS et al. Defining community acquired pneumonia severity on presentation to hospital: an international derivation and validation study. Thorax. 2003;58(5):377-82.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-14',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('confusion', 'Confusão mental (nova desorientação em pessoa, tempo ou lugar)'),
    yesNoItem('urea', 'Ureia > 42 mg/dL (> 7 mmol/L)'),
    yesNoItem('rr', 'Frequência respiratória ≥ 30 irpm'),
    yesNoItem('bp', 'Pressão arterial: PAS < 90 ou PAD ≤ 60 mmHg'),
    yesNoItem('age', 'Idade ≥ 65 anos'),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixa',
        upTo: { value: 1, inclusive: true },
        label: 'Baixa gravidade',
        tone: 'neutral',
        action: 'Mortalidade ~1,5%. Considere tratamento ambulatorial.',
      },
      {
        id: 'moderada',
        upTo: { value: 2, inclusive: true },
        label: 'Gravidade moderada',
        tone: 'attention',
        action: 'Mortalidade ~9,2%. Considere internação hospitalar curta ou observação.',
      },
      {
        id: 'alta',
        upTo: { value: 3, inclusive: true },
        label: 'Alta gravidade',
        tone: 'critical',
        action: 'Mortalidade ~22%. Internação hospitalar recomendada. Escore ≥ 4: considere UTI.',
      },
    ],
    otherwise: {
      id: 'muito-alta',
      label: 'Alta gravidade',
      tone: 'critical',
      action: 'Mortalidade > 30%. Internação hospitalar recomendada. Escore ≥ 4: considere UTI.',
    },
  },
};

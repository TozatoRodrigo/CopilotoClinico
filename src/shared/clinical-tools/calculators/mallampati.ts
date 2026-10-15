import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/** Porte do `mallampati` do ANY. Classes e faixas iguais; a classe é o resultado. */
export const MALLAMPATI: ClassificationCalculator = {
  kind: 'classification',
  id: 'mallampati',
  name: 'Mallampati',
  aliases: ['mallampati', 'via aérea', 'avaliação', 'intubação difícil', 'preoperatorio'],
  category: 'Via aérea',
  description: 'Classificação da orofaringe para predição de via aérea difícil.',
  reference: {
    why: 'Avaliação pré-intubação rápida que ajuda a prever a dificuldade da laringoscopia.',
    whenToUse:
      'Avaliação pré-intubação de qualquer paciente, para estimar a dificuldade da via aérea.',
    pearlsPitfalls: [
      'Classe I: pilares, palato mole e úvula completamente visíveis.',
      'Classe II: pilares e palato mole visíveis, úvula parcialmente visível.',
      'Classe III: apenas palato mole visível.',
      'Classe IV: apenas palato duro visível.',
      'Mallampati III–IV isolado tem sensibilidade limitada (~50%): usar com outros preditores.',
      'Avaliar com o paciente sentado, boca aberta, língua protrusa, sem fonação.',
    ],
    citation:
      'Mallampati SR et al. A clinical sign to predict difficult tracheal intubation: a prospective study. Can Anaesth Soc J. 1985;32(4):429-34.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('class', 'Classificação orofaríngea', [
      ['i', 'Classe I — pilares amigdalianos, palato mole e úvula completamente visíveis', 1],
      ['ii', 'Classe II — pilares e palato mole visíveis, úvula parcialmente visível', 2],
      ['iii', 'Classe III — apenas palato mole visível', 3],
      ['iv', 'Classe IV — apenas palato duro visível', 4],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'i',
        upTo: { value: 1, inclusive: true },
        label: 'Classe I — baixo risco',
        tone: 'neutral',
        action: 'Via aérea provavelmente fácil. Úvula e pilares completamente visíveis.',
      },
      {
        id: 'ii',
        upTo: { value: 2, inclusive: true },
        label: 'Classe II — risco baixo a moderado',
        tone: 'neutral',
        action: 'Via aérea geralmente sem dificuldade significativa.',
      },
      {
        id: 'iii',
        upTo: { value: 3, inclusive: true },
        label: 'Classe III — risco moderado a alto',
        tone: 'attention',
        action: 'Visualização limitada. Considere videolaringoscópio e bougie disponíveis.',
      },
    ],
    otherwise: {
      id: 'iv',
      label: 'Classe IV — alto risco',
      tone: 'critical',
      action:
        'Alta probabilidade de via aérea difícil. Considere planejar abordagem alternativa, com dispositivo supraglótico e cricotireoidostomia acessíveis.',
    },
  },
};

import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/** Porte do `cormackLehane` do ANY. Graus e faixas iguais; o grau é o resultado. */
export const CORMACK_LEHANE: ClassificationCalculator = {
  kind: 'classification',
  id: 'cormack-lehane',
  name: 'Cormack-Lehane',
  aliases: ['cormack', 'lehane', 'laringoscopia', 'via aérea', 'intubação', 'visualização'],
  category: 'Via aérea',
  description: 'Classificação da visualização laringoscópica durante a intubação orotraqueal.',
  reference: {
    why: 'Padrão universal para comunicar a dificuldade de visualização glótica entre equipes.',
    whenToUse:
      'Durante a laringoscopia direta ou a videolaringoscopia, para registrar o grau de visualização.',
    pearlsPitfalls: [
      'Grau I: cordas vocais completamente visíveis; intubação fácil.',
      'Grau II: visualização parcial das cordas vocais; geralmente possível com bougie.',
      'Grau III: apenas epiglote visível; considere bougie ou dispositivo supraglótico.',
      'Grau IV: nem a epiglote visível; via aérea difícil, considere plano alternativo.',
      'A manipulação laríngea externa (BURP) pode melhorar a visualização em 1 grau.',
    ],
    citation:
      'Cormack RS, Lehane J. Difficult tracheal intubation in obstetrics. Anaesthesia. 1984;39(11):1105-11.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('grade', 'Visualização laringoscópica', [
      ['i', 'Grau I — cordas vocais completamente visíveis', 1],
      ['ii', 'Grau II — visualização parcial das cordas vocais (comissura posterior)', 2],
      ['iii', 'Grau III — apenas epiglote visível, cordas vocais não visíveis', 3],
      ['iv', 'Grau IV — nem a epiglote visível (apenas palato mole)', 4],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'i',
        upTo: { value: 1, inclusive: true },
        label: 'Grau I — visualização completa',
        tone: 'neutral',
        action: 'Cordas vocais completamente visíveis. Intubação geralmente fácil.',
      },
      {
        id: 'ii',
        upTo: { value: 2, inclusive: true },
        label: 'Grau II — visualização parcial',
        tone: 'neutral',
        action:
          'Visualização parcial das cordas vocais. Intubação geralmente possível; considere bougie se houver dificuldade.',
      },
      {
        id: 'iii',
        upTo: { value: 3, inclusive: true },
        label: 'Grau III — apenas epiglote',
        tone: 'attention',
        action:
          'Apenas epiglote visível. Considere bougie, videolaringoscópio ou dispositivo supraglótico.',
      },
    ],
    otherwise: {
      id: 'iv',
      label: 'Grau IV — sem visualização',
      tone: 'critical',
      action:
        'Nem a epiglote visível. Via aérea difícil. Considere dispositivo supraglótico e cricotireoidostomia se emergência.',
    },
  },
};

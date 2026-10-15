import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/**
 * Porte do `mgso4Dose` do ANY. O "valor" só escolhe o esquema (Zuspan ou
 * Pritchard); as doses do texto são as de lá, sem mudança. Informativo (azul
 * no ANY), aqui neutro.
 */
export const MGSO4_DOSE: ClassificationCalculator = {
  kind: 'classification',
  id: 'mgso4-dose',
  name: 'Dose de sulfato de magnésio (eclâmpsia/pré-eclâmpsia)',
  aliases: [
    'magnésio',
    'sulfato de magnésio',
    'mgso4',
    'eclampsia',
    'pre-eclampsia',
    'zuspan',
    'pritchard',
  ],
  category: 'Obstetrícia',
  description: 'Esquemas de sulfato de magnésio para prevenção e tratamento da eclâmpsia.',
  reference: {
    why: 'O sulfato de magnésio é o padrão-ouro para prevenção e tratamento das convulsões eclâmpticas.',
    whenToUse: 'Gestantes com pré-eclâmpsia grave ou eclâmpsia, para anticonvulsivoterapia.',
    pearlsPitfalls: [
      'Zuspan (IV puro): ataque 4 g IV em 20 min + manutenção 1–2 g/h IV.',
      'Pritchard (IV + IM): ataque 4 g IV + 10 g IM (5 g em cada glúteo) + manutenção 5 g IM de 4/4 h.',
      'Monitorar: reflexo patelar, frequência respiratória (≥ 16), diurese (≥ 25 mL/h).',
      'Nível terapêutico: 4–7 mEq/L. Nível tóxico: > 7 mEq/L.',
      'Antídoto: gluconato de cálcio 1 g IV em 3–5 min se toxicidade.',
      'Manter por 24 h após o parto ou 24 h após a última convulsão.',
    ],
    citation:
      'MAGPIE Trial. Do women with pre-eclampsia, and their babies, benefit from magnesium sulphate? The Magpie Trial: a randomised placebo-controlled trial. Lancet. 2002;359(9321):1877-90.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('regimen', 'Esquema posológico', [
      ['zuspan', 'Zuspan (IV puro) — mais utilizado em centros com bomba de infusão', 1],
      ['pritchard', 'Pritchard (IV + IM) — útil quando a bomba de infusão não está disponível', 2],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'zuspan',
        upTo: { value: 1, inclusive: true },
        label: 'Zuspan — IV puro',
        tone: 'neutral',
        action:
          'Ataque: MgSO4 4 g IV em 20 min (diluir 8 mL de MgSO4 50% em 100 mL de SF 0,9%). Manutenção: 1–2 g/h IV (bomba de infusão). Monitorização: reflexo patelar, FR ≥ 16 irpm, diurese ≥ 25 mL/h. Manter por 24 h pós-parto. Antídoto: gluconato de cálcio 1 g IV se toxicidade.',
      },
    ],
    otherwise: {
      id: 'pritchard',
      label: 'Pritchard — IV + IM',
      tone: 'neutral',
      action:
        'Ataque: MgSO4 4 g IV em 20 min + 10 g IM (5 g em cada glúteo, agulha 20G). Manutenção: 5 g IM a cada 4 h (alternando os glúteos). Antes de cada dose IM: verificar reflexo patelar, FR ≥ 16 irpm e diurese ≥ 25 mL/h nas últimas 4 h. Manter por 24 h pós-parto. Antídoto: gluconato de cálcio 1 g IV se toxicidade.',
    },
  },
};

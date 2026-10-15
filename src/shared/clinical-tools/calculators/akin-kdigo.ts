import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/** Porte do `akinKdigo` do ANY. Estágios e faixas iguais; ações como sugestão. */
export const AKIN_KDIGO: ClassificationCalculator = {
  kind: 'classification',
  id: 'akin-kdigo',
  name: 'AKIN/KDIGO',
  aliases: ['akin', 'kdigo', 'ira', 'insuficiência renal', 'lesão renal aguda', 'creatinina'],
  category: 'Renal / Metabólico',
  description: 'Estadiamento de lesão renal aguda por creatinina e diurese.',
  reference: {
    why: 'Critérios unificados KDIGO para classificar a gravidade da IRA e guiar o manejo.',
    whenToUse:
      'Pacientes com aumento de creatinina ou oligúria, para classificar o estágio da IRA.',
    pearlsPitfalls: [
      'Estágio 1: Cr aumento ≥ 0,3 mg/dL ou 1,5–1,9x o basal ou diurese < 0,5 mL/kg/h por 6–12 h.',
      'Estágio 2: Cr 2,0–2,9x o basal ou diurese < 0,5 mL/kg/h por ≥ 12 h.',
      'Estágio 3: Cr ≥ 3x o basal ou ≥ 4,0 mg/dL ou início de diálise ou diurese < 0,3 mL/kg/h por ≥ 24 h ou anúria ≥ 12 h.',
      'Creatinina basal: usar o valor mais recente dos últimos 7–90 dias.',
      'A diurese sozinha pode classificar a IRA: não depende apenas da creatinina.',
    ],
    citation:
      'KDIGO Clinical Practice Guideline for Acute Kidney Injury. Kidney Int Suppl. 2012;2(1):1-138.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('stage', 'Critério de creatinina ou diurese (usar o pior)', [
      ['0', 'Sem critério de IRA', 0],
      [
        '1',
        'Estágio 1: Cr ≥ 0,3 mg/dL acima do basal ou 1,5–1,9x o basal ou diurese < 0,5 mL/kg/h por 6–12 h',
        1,
      ],
      ['2', 'Estágio 2: Cr 2,0–2,9x o basal ou diurese < 0,5 mL/kg/h por ≥ 12 h', 2],
      ['3', 'Estágio 3: Cr ≥ 3x o basal ou ≥ 4,0 mg/dL ou diálise ou anúria ≥ 12 h', 3],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: '0',
        upTo: { value: 0, inclusive: true },
        label: 'Sem IRA',
        tone: 'neutral',
        action:
          'Não preenche critérios de lesão renal aguda. Considere monitorar se houver fatores de risco.',
      },
      {
        id: '1',
        upTo: { value: 1, inclusive: true },
        label: 'KDIGO Estágio 1',
        tone: 'attention',
        action:
          'IRA leve. Considere otimizar a volemia, suspender nefrotóxicos e monitorar creatinina e diurese.',
      },
      {
        id: '2',
        upTo: { value: 2, inclusive: true },
        label: 'KDIGO Estágio 2',
        tone: 'critical',
        action: 'IRA moderada. Monitoramento intensivo. Considere avaliação nefrológica.',
      },
    ],
    otherwise: {
      id: '3',
      label: 'KDIGO Estágio 3',
      tone: 'critical',
      action:
        'IRA grave. Considere avaliar a indicação de terapia de substituição renal e nefrologia com urgência.',
    },
  },
};

import type { FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import {
  checkDum,
  DUM_INPUTS,
  formatEpochDay,
  formatGestationalAge,
  gestationalDays,
  naegeleDueDate,
} from './dum';

/**
 * Porte do `dppDum` do ANY. O ANY devolvia um número codificado (semanas,
 * dias e a data espremidos num decimal); aqui o valor é a própria DPP (DUM +
 * 280 dias) e a idade gestacional de hoje sai como detalhe. Data inexistente
 * e DUM no futuro não calculam (`checkDum`).
 */
export const DPP_DUM: FormulaCalculator = {
  kind: 'formula',
  id: 'dpp-dum',
  name: 'Data Provável do Parto (DPP)',
  aliases: ['dpp', 'dum', 'data provável parto', 'idade gestacional', 'gestacao', 'naegele'],
  category: 'Obstetrícia',
  description: 'Calcula a data provável do parto pela regra de Naegele (DUM + 280 dias).',
  reference: {
    why: 'Estimativa rápida da data provável do parto para planejamento e classificação da idade gestacional.',
    whenToUse: 'Gestantes, para estimar a data provável do parto e a idade gestacional atual.',
    pearlsPitfalls: [
      'Regra de Naegele: DUM + 280 dias (40 semanas).',
      'Assume ciclos regulares de 28 dias: ajustar se os ciclos forem irregulares.',
      'O ultrassom do 1º trimestre é mais preciso que a DUM para datar a gestação.',
      'DUM confiável: se a paciente tem certeza da data e ciclos regulares.',
    ],
    citation: 'Regra de Naegele. Standard obstetric practice.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: DUM_INPUTS,
  decimals: 0,
  formatValue: formatEpochDay,
  check: checkDum,
  compute: (values) => naegeleDueDate(values),
  details: (_dueDate, values, context) => [
    {
      label: 'Idade gestacional hoje',
      value: formatGestationalAge(gestationalDays(values, context)),
    },
  ],
  interpretation: {
    bands: [],
    otherwise: {
      id: 'dpp',
      label: 'Data provável do parto (Naegele)',
      tone: 'neutral',
      action: 'Considere confirmar com o ultrassom do 1º trimestre.',
    },
  },
};

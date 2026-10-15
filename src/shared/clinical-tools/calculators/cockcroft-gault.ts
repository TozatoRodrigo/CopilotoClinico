import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `cockcroftGault` do ANY. Mesma conta ((140 - idade) × peso / (72 ×
 * Cr) × fator do sexo, uma casa) e faixas. O sexo é parâmetro da fórmula e
 * não vem marcado (no ANY abria em "Masculino"). Ações como sugestão.
 */
export const COCKCROFT_GAULT: FormulaCalculator = {
  kind: 'formula',
  id: 'cockcroft-gault',
  name: 'Cockcroft-Gault',
  aliases: ['cockcroft', 'gault', 'clearance creatinina', 'função renal', 'tfg', 'clcr'],
  category: 'Renal / Metabólico',
  description: 'Estimativa do clearance de creatinina para ajuste de dose de medicamentos.',
  reference: {
    why: 'Muitos medicamentos usam o ClCr de Cockcroft-Gault como referência para ajuste posológico.',
    whenToUse:
      'Ajuste de dose de medicamentos eliminados por via renal (antibióticos, anticoagulantes etc.).',
    pearlsPitfalls: [
      'Fórmula: (140 - idade) × peso / (72 × Cr). Multiplicar por 0,85 se sexo feminino.',
      'Usar o peso real. Em obesos, considere o peso ideal ou ajustado.',
      'Não é a mesma coisa que TFG (CKD-EPI): Cockcroft-Gault estima o clearance de creatinina.',
      'Superestima em pacientes obesos e subestima na caquexia.',
      'A creatinina deve estar em mg/dL.',
    ],
    citation:
      'Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron. 1976;16(1):31-41.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'age', label: 'Idade', unit: 'anos', min: 18, max: 120, step: 1 },
    { id: 'weight', label: 'Peso', unit: 'kg', min: 30, max: 250, step: 0.5 },
    { id: 'creatinine', label: 'Creatinina sérica', unit: 'mg/dL', min: 0.1, max: 20, step: 0.01 },
  ],
  items: [
    choiceItem(
      'sex',
      'Sexo',
      [
        ['masculino', 'Masculino', 1],
        ['feminino', 'Feminino', 0.85],
      ],
      'parameter',
    ),
  ],
  decimals: 1,
  unit: 'mL/min',
  compute: (values) => {
    const clearance =
      (((140 - requireValue(values, 'age')) * requireValue(values, 'weight')) /
        (72 * requireValue(values, 'creatinine'))) *
      requireValue(values, 'sex');
    return Math.round(clearance * 10) / 10;
  },
  interpretation: {
    bands: [
      {
        id: 'falencia',
        upTo: { value: 15, inclusive: false },
        label: 'Falência renal',
        tone: 'critical',
        action: 'Falência renal. Considere terapia de substituição renal e consultar a nefrologia.',
      },
      {
        id: 'grave',
        upTo: { value: 30, inclusive: false },
        label: 'Redução grave',
        tone: 'critical',
        action: 'Redução grave. Ajuste de dose obrigatório. Considere avaliação nefrológica.',
      },
      {
        id: 'moderada',
        upTo: { value: 60, inclusive: false },
        label: 'Redução moderada',
        tone: 'attention',
        action: 'Redução moderada. Ajuste de dose recomendado para muitos medicamentos.',
      },
      {
        id: 'leve',
        upTo: { value: 90, inclusive: false },
        label: 'Redução leve',
        tone: 'neutral',
        action: 'Redução leve. Considere verificar a necessidade de ajuste para cada medicamento.',
      },
    ],
    otherwise: {
      id: 'normal',
      label: 'Normal',
      tone: 'neutral',
      action: 'Função renal normal. Ajuste de dose geralmente desnecessário.',
    },
  },
};

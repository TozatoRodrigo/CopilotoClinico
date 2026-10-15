import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Katz com o fator escolhido, uma casa. Também é a conta do sódio corrigido do
 * roteiro de CAD e EHH (CC-326), que fixa o fator em 2,0.
 */
export function katzCorrectedSodium(sodium: number, glucose: number, factor: number): number {
  return Math.round((sodium + factor * ((glucose - 100) / 100)) * 10) / 10;
}

/**
 * Porte do `correçãoNa` do ANY (Katz). Mesma conta (uma casa) e faixas; o
 * fator abre em 1,6, como lá, e aceita qualquer valor de 1,6 a 2,4 (achado
 * para a revisão clínica, CC-310). Ação da hipernatremia como sugestão.
 */
export const CORRECAO_NA: FormulaCalculator = {
  kind: 'formula',
  id: 'correcao-na',
  name: 'Correção de sódio na hiperglicemia (Katz)',
  aliases: [
    'sódio',
    'hiponatremia',
    'correção sódio',
    'katz',
    'hiperglicemia',
    'pseudo-hiponatremia',
    'cetoacidose',
  ],
  category: 'Renal / Metabólico',
  description: 'Estima o sódio real a partir do sódio medido em vigência de hiperglicemia.',
  reference: {
    why: 'A hiperglicemia desloca água do intracelular e dilui o sódio medido. Sem corrigir, uma hiponatremia apenas dilucional pode ser tratada como se fosse perda real de sódio.',
    whenToUse:
      'Paciente com hiperglicemia (cetoacidose diabética, estado hiperosmolar) e sódio medido baixo.',
    pearlsPitfalls: [
      'Katz: sódio corrigido = sódio medido + 1,6 × (glicose - 100) / 100.',
      'Hillier propõe fator 2,4, mais preciso com glicose acima de 400 mg/dL.',
      'Se o sódio corrigido for normal ou alto, a hiponatremia é dilucional e se resolve tratando a hiperglicemia.',
      'Sódio corrigido elevado na cetoacidose sinaliza déficit de água livre importante.',
      'Não confundir com a fórmula de Adrogué-Madias, que estima a variação do sódio após infusão: calculadora separada.',
    ],
    citation:
      'Katz MA. Hyperglycemia-induced hyponatremia: calculation of expected serum sodium depression. N Engl J Med. 1973;289(16):843-4. Fator alternativo: Hillier TA et al. Hyponatremia: evaluating the correction factor for hyperglycemia. Am J Med. 1999;106(4):399-403.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'na_measured', label: 'Sódio medido', unit: 'mEq/L', min: 100, max: 160, step: 1 },
    { id: 'glucose', label: 'Glicose', unit: 'mg/dL', min: 100, max: 1500, step: 1 },
    {
      id: 'factor',
      label: 'Fator de correção (1,6 Katz; 2,4 Hillier)',
      unit: '',
      min: 1.6,
      max: 2.4,
      step: 0.8,
      defaultValue: 1.6,
    },
  ],
  decimals: 1,
  unit: 'mEq/L',
  compute: (values) =>
    katzCorrectedSodium(
      requireValue(values, 'na_measured'),
      requireValue(values, 'glucose'),
      requireValue(values, 'factor'),
    ),
  interpretation: {
    bands: [
      {
        id: 'hiponatremia',
        upTo: { value: 135, inclusive: false },
        label: 'Hiponatremia verdadeira',
        tone: 'attention',
        action:
          'A hiponatremia persiste após corrigir pela glicose. Considere investigar a causa e conduzir como hiponatremia real.',
      },
      {
        id: 'normal',
        upTo: { value: 145, inclusive: true },
        label: 'Normal',
        tone: 'neutral',
        action:
          'A hiponatremia medida é dilucional pela hiperglicemia. Tende a se corrigir com o tratamento da glicemia.',
      },
    ],
    otherwise: {
      id: 'hipernatremia',
      label: 'Hipernatremia',
      tone: 'critical',
      action:
        'Sugere déficit importante de água livre, comum na cetoacidose e no estado hiperosmolar. Considere reposição de água livre junto ao tratamento da hiperglicemia.',
    },
  },
};

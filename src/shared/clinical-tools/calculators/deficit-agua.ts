import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * ACT × (Na/140 - 1), em litros, sem arredondar: cada ferramenta arredonda do
 * seu jeito (aqui 2 casas; no roteiro de CAD e EHH, CC-326, uma).
 */
export function freeWaterDeficitLiters(totalBodyWater: number, sodium: number): number {
  return totalBodyWater * (sodium / 140 - 1);
}

/**
 * Porte do `deficitAgua` do ANY. Mesma conta (ACT × (Na/140 - 1), em litros,
 * 2 casas); o fator de água corporal abre em 0,6, como lá. Resultado
 * informativo; a ação de lá ("Repor X litros…") virou sugestão sem repetir o
 * número, que já aparece como valor.
 */
export const DEFICIT_AGUA: FormulaCalculator = {
  kind: 'formula',
  id: 'deficit-agua',
  name: 'Déficit de Água Livre',
  aliases: ['déficit agua', 'hipernatremia', 'agua livre', 'desidratacao'],
  category: 'Renal / Metabólico',
  description: 'Cálculo do déficit de água livre na hipernatremia.',
  reference: {
    why: 'Estima o volume de água livre necessário para normalizar o sódio sérico.',
    whenToUse: 'Pacientes com hipernatremia (Na > 145 mEq/L), para planejar a reposição.',
    pearlsPitfalls: [
      'Fórmula: ACT × (Na atual/140 - 1). ACT = peso × fator.',
      'Corrigir no máximo 10–12 mEq/L em 24 h para evitar edema cerebral.',
      'Não esquecer de repor as perdas insensíveis e urinárias em andamento.',
      'Hipernatremia crônica (> 48 h): correção lenta. Aguda (< 48 h): pode corrigir mais rápido.',
    ],
    citation: 'Adrogué HJ, Madias NE. Hypernatremia. N Engl J Med. 2000;342(20):1493-9.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'na', label: 'Sódio atual', unit: 'mEq/L', min: 130, max: 200, step: 1 },
    { id: 'weight', label: 'Peso', unit: 'kg', min: 20, max: 200, step: 0.5 },
    {
      id: 'act_factor',
      label: 'Fator de água corporal total',
      unit: '',
      min: 0.4,
      max: 0.6,
      step: 0.05,
      defaultValue: 0.6,
    },
  ],
  decimals: 2,
  unit: 'L',
  compute: (values) => {
    const totalWater = requireValue(values, 'weight') * requireValue(values, 'act_factor');
    const deficit = freeWaterDeficitLiters(totalWater, requireValue(values, 'na'));
    return Math.round(deficit * 100) / 100;
  },
  interpretation: {
    bands: [],
    otherwise: {
      id: 'deficit',
      label: 'Déficit de água livre',
      tone: 'neutral',
      action:
        'Considere repor o volume calculado de água livre, corrigindo no máximo 10–12 mEq/L em 24 h e somando as perdas insensíveis em andamento. Opções: SG 5% ou água livre por via enteral.',
    },
  },
};

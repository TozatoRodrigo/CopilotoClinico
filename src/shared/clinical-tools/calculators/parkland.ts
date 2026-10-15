import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `parkland` do ANY. Mesma conta (4 mL × peso × %SCQ, com a SCQ
 * limitada a 50%, arredondada em mL) e a mesma divisão 8 h / 16 h, que sai
 * como detalhe. Resultado informativo (azul no ANY), aqui neutro.
 */
export const PARKLAND: FormulaCalculator = {
  kind: 'formula',
  id: 'parkland',
  name: 'Fórmula de Parkland',
  aliases: ['parkland', 'queimadura', 'queimado', 'scq', 'reposição volêmica', 'grande queimado'],
  category: 'Trauma',
  description: 'Volume de reposição volêmica nas primeiras 24 h em grandes queimados.',
  reference: {
    why: 'Padrão-ouro para a ressuscitação volêmica inicial em queimaduras. Previne choque hipovolêmico.',
    whenToUse: 'Queimaduras ≥ 20% SCQ em adultos ou ≥ 10% SCQ em crianças, nas primeiras 24 h.',
    pearlsPitfalls: [
      'Fórmula: 4 mL × peso (kg) × %SCQ. Metade nas primeiras 8 h, metade nas 16 h seguintes.',
      'Conta a partir da hora da queimadura, NÃO da chegada ao hospital.',
      'Guiar a reposição pela diurese: adulto 0,5–1 mL/kg/h, criança 1 mL/kg/h.',
      'Superestima o volume em queimaduras > 50% SCQ: usar 50% como máximo.',
      'Queimadura por inalação pode exigir 30–40% mais volume.',
    ],
    citation:
      'Baxter CR, Shires T. Physiological response to crystalloid resuscitation of severe burns. Ann N Y Acad Sci. 1968;150(3):874-94.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'weight', label: 'Peso', unit: 'kg', min: 1, max: 200, step: 0.5 },
    { id: 'scq', label: 'Superfície corporal queimada', unit: '%', min: 1, max: 100, step: 1 },
  ],
  decimals: 0,
  unit: 'mL',
  compute: (values) => {
    const scq = Math.min(requireValue(values, 'scq'), 50);
    return Math.round(4 * requireValue(values, 'weight') * scq);
  },
  details: (total) => {
    const first8h = Math.round(total / 2);
    const next16h = total - first8h;
    return [
      {
        label: 'Primeiras 8 h (desde a queimadura)',
        value: `${first8h} mL (${Math.round(first8h / 8)} mL/h)`,
      },
      { label: 'Próximas 16 h', value: `${next16h} mL (${Math.round(next16h / 16)} mL/h)` },
    ];
  },
  interpretation: {
    bands: [],
    otherwise: {
      id: 'volume-24h',
      label: 'Volume total em 24 h',
      tone: 'neutral',
      action:
        'Metade nas primeiras 8 h desde a queimadura e metade nas 16 h seguintes. Considere guiar pela diurese.',
    },
  },
};

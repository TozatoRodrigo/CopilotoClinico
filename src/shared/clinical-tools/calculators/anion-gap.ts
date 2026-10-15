import { requireValue, type FormulaCalculator } from '../calculator';
import { formatDecimal } from '../numbers';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * AG bruto, Na - (Cl + HCO3), sem arredondar e sem albumina. O roteiro de CAD e
 * EHH (CC-326) usa a mesma conta, arredondada para inteiro.
 */
export function rawAnionGap(sodium: number, chloride: number, bicarbonate: number): number {
  return sodium - (chloride + bicarbonate);
}

/**
 * Porte do `anionGap` do ANY. O valor é o AG corrigido pela albumina (uma
 * casa); o AG bruto sai como detalhe. A albumina é opcional como lá: vazia,
 * a conta usa 4,0. Ações como sugestão.
 */
export const ANION_GAP: FormulaCalculator = {
  kind: 'formula',
  id: 'anion-gap',
  name: 'Anion Gap',
  aliases: ['anion gap', 'ag', 'acidose metabólica', 'gasometria', 'gap anionico'],
  category: 'Renal / Metabólico',
  description: 'Cálculo do anion gap com correção pela albumina.',
  reference: {
    why: 'Diferencia a acidose metabólica com AG elevado (cetonas, lactato, tóxicos) da com AG normal (hiperclorêmica).',
    whenToUse: 'Pacientes com acidose metabólica, para classificar a etiologia.',
    pearlsPitfalls: [
      'AG = Na - (Cl + HCO3). Normal: 12 ± 2 mEq/L.',
      'Corrigir pela albumina: AG corrigido = AG + 2,5 × (4,0 - albumina).',
      'AG elevado: cetoacidose, acidose lática, uremia, intoxicação (metanol, etilenoglicol, salicilato).',
      'AG normal com acidose: perda de HCO3 (diarreia, acidose tubular renal, salina excessiva).',
      'Sempre calcular o delta gap (delta/delta) quando o AG estiver elevado.',
    ],
    citation:
      'Emmett M, Narins RG. Clinical use of the anion gap. Medicine (Baltimore). 1977;56(1):38-54.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'na', label: 'Sódio', unit: 'mEq/L', min: 100, max: 180, step: 1 },
    { id: 'cl', label: 'Cloro', unit: 'mEq/L', min: 60, max: 140, step: 1 },
    { id: 'hco3', label: 'Bicarbonato (HCO3)', unit: 'mEq/L', min: 1, max: 50, step: 0.1 },
    {
      id: 'albumin',
      label: 'Albumina (opcional, para correção)',
      unit: 'g/dL',
      min: 0.5,
      max: 6,
      step: 0.1,
      defaultValue: 4,
      optional: true,
    },
  ],
  decimals: 1,
  unit: 'mEq/L',
  compute: (values) => {
    const ag = rawAnionGap(
      requireValue(values, 'na'),
      requireValue(values, 'cl'),
      requireValue(values, 'hco3'),
    );
    const corrected = ag + 2.5 * (4.0 - requireValue(values, 'albumin'));
    return Math.round(corrected * 10) / 10;
  },
  details: (_value, values) => {
    const raw = rawAnionGap(
      requireValue(values, 'na'),
      requireValue(values, 'cl'),
      requireValue(values, 'hco3'),
    );
    return [{ label: 'AG bruto', value: `${formatDecimal(raw, 1)} mEq/L` }];
  },
  interpretation: {
    bands: [
      {
        id: 'normal',
        upTo: { value: 14, inclusive: true },
        label: 'Normal',
        tone: 'neutral',
        action:
          'AG corrigido normal (≤ 14). Se houver acidose, considere causa com AG normal (hiperclorêmica).',
      },
      {
        id: 'elevado',
        upTo: { value: 20, inclusive: true },
        label: 'Elevado',
        tone: 'attention',
        action:
          'AG elevado. Considere investigar lactato, cetonas, função renal e tóxicos, e calcular o delta gap.',
      },
    ],
    otherwise: {
      id: 'muito-elevado',
      label: 'Muito elevado',
      tone: 'critical',
      action:
        'AG muito elevado. Causas: cetoacidose, acidose lática, uremia, intoxicação (metanol, etilenoglicol, salicilato). Considere investigar e tratar com urgência.',
    },
  },
};

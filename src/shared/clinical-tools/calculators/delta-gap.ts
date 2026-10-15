import { requireValue, type FormulaCalculator } from '../calculator';
import { formatDecimal } from '../numbers';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Razão ΔAG/ΔHCO3 (AG normal 12, HCO3 normal 24), 2 casas. Também é a conta
 * do delta/delta no ciclo de reavaliação da CAD (CC-326).
 */
export function deltaRatio(anionGap: number, bicarbonate: number): number {
  const deltaAg = anionGap - 12;
  const deltaHco3 = 24 - bicarbonate;
  return Math.round((deltaAg / deltaHco3) * 100) / 100;
}

/**
 * Porte do `deltaGap` do ANY. Mesma razão ΔAG/ΔHCO3 (2 casas) e mesmas
 * faixas; o delta gap sai como detalhe. Com HCO3 = 24 a razão não existe: o
 * ANY devolvia 999 e mostrava "HCO3 normal"; aqui o campo fica marcado e a
 * mesma explicação aparece, sem número.
 */
export const DELTA_GAP: FormulaCalculator = {
  kind: 'formula',
  id: 'delta-gap',
  name: 'Delta Gap e Razão Delta/Delta',
  aliases: [
    'delta gap',
    'delta delta',
    'razao delta',
    'anion gap',
    'acidose metabólica',
    'gasometria',
  ],
  category: 'Hemodinâmica',
  description: 'Identifica distúrbios ácido-básicos mistos em acidose com AG elevado.',
  reference: {
    why: 'Em acidose metabólica com AG elevado, avalia se há distúrbio ácido-básico concomitante oculto.',
    whenToUse:
      'Pacientes com acidose metabólica e anion gap elevado, para detectar distúrbios mistos.',
    pearlsPitfalls: [
      'Delta Gap = (AG - 12) - (24 - HCO3). Se positivo, alcalose metabólica associada. Se negativo, acidose hiperclorêmica associada.',
      'Razão Delta = (AG - 12) / (24 - HCO3). Normal: 1–2.',
      'Razão > 2: alcalose metabólica coexistente.',
      'Razão < 1: acidose hiperclorêmica (AG normal) coexistente.',
      'AG corrigido para albumina: AG + 2,5 × (4,0 - albumina).',
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
    { id: 'ag', label: 'Anion Gap', unit: 'mEq/L', min: 0, max: 50, step: 0.1 },
    { id: 'hco3', label: 'Bicarbonato (HCO3)', unit: 'mEq/L', min: 1, max: 50, step: 0.1 },
  ],
  decimals: 2,
  check: (values) =>
    requireValue(values, 'hco3') === 24
      ? {
          inputId: 'hco3',
          message:
            'Bicarbonato normal (24 mEq/L): a razão delta/delta só se calcula com HCO3 reduzido.',
        }
      : null,
  compute: (values) => deltaRatio(requireValue(values, 'ag'), requireValue(values, 'hco3')),
  details: (_value, values) => {
    const deltaGap = requireValue(values, 'ag') - 12 - (24 - requireValue(values, 'hco3'));
    return [{ label: 'Delta gap', value: formatDecimal(deltaGap, 1) }];
  },
  interpretation: {
    bands: [
      {
        id: 'hipercloremica',
        upTo: { value: 1, inclusive: false },
        label: 'Acidose hiperclorêmica concomitante',
        tone: 'attention',
        action: 'Razão < 1 sugere acidose metabólica com AG normal associada (hiperclorêmica).',
      },
      {
        id: 'pura',
        upTo: { value: 2, inclusive: true },
        label: 'Acidose AG elevado pura',
        tone: 'neutral',
        action:
          'Razão entre 1 e 2 sugere acidose com AG elevado sem distúrbio misto significativo.',
      },
    ],
    otherwise: {
      id: 'alcalose',
      label: 'Alcalose metabólica concomitante',
      tone: 'attention',
      action: 'Razão > 2 sugere alcalose metabólica associada.',
    },
  },
};

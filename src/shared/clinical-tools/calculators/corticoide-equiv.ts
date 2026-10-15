import { requireValue, type FormulaCalculator } from '../calculator';
import { formatCompact } from '../numbers';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Converte a dose em prednisona para outro corticoide, como no ANY (2 casas). */
function fromPrednisone(prednisone: number, factor: number): string {
  return `${formatCompact(Math.round(prednisone * factor * 100) / 100)} mg`;
}

/**
 * Porte do `corticoidEquiv` do ANY. O valor é a dose equivalente em
 * prednisona (2 casas); hidrocortisona, metilprednisolona e dexametasona saem
 * como detalhe, com os mesmos fatores de lá (×4, ×0,8, ×0,15). A potência do
 * corticoide de origem é parâmetro da fórmula e não vem marcada.
 */
export const CORTICOIDE_EQUIV: FormulaCalculator = {
  kind: 'formula',
  id: 'corticoide-equiv',
  name: 'Equivalência de corticoides',
  aliases: [
    'corticoide',
    'cortisol',
    'prednisona',
    'dexametasona',
    'hidrocortisona',
    'metilprednisolona',
    'equivalência',
  ],
  category: 'Farmacologia',
  description: 'Tabela de conversão entre corticoides com potências relativas.',
  reference: {
    why: 'Permite a conversão segura entre diferentes corticoides, mantendo a equivalência terapêutica.',
    whenToUse:
      'Quando for necessário trocar um corticoide por outro ou comparar doses entre esquemas.',
    pearlsPitfalls: [
      'Referência: prednisona 5 mg = 1 unidade de equivalência.',
      'As potências anti-inflamatória e mineralocorticoide variam independentemente.',
      'A meia-vida e a duração do efeito devem ser consideradas na troca.',
      'Doses altas por tempo prolongado: considere desmame, não suspensão abrupta.',
      'Tabela: hidrocortisona 20 mg = prednisona 5 mg = metilprednisolona 4 mg = dexametasona 0,75 mg.',
    ],
    citation:
      "Schimmer BP, Funder JW. ACTH, adrenal steroids, and pharmacology of the adrenal cortex. In: Goodman & Gilman's The Pharmacological Basis of Therapeutics. 13th ed.",
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [{ id: 'dose', label: 'Dose atual', unit: 'mg', min: 0.1, max: 2000, step: 0.1 }],
  items: [
    choiceItem(
      'from',
      'Corticoide de origem',
      [
        ['hidrocortisona', 'Hidrocortisona (equiv. 20 mg)', 20],
        ['cortisona', 'Cortisona (equiv. 25 mg)', 25],
        ['prednisona', 'Prednisona (equiv. 5 mg)', 5],
        ['prednisolona', 'Prednisolona (equiv. 5 mg)', 5],
        ['metilprednisolona', 'Metilprednisolona (equiv. 4 mg)', 4],
        ['triancinolona', 'Triancinolona (equiv. 4 mg)', 4],
        ['dexametasona', 'Dexametasona (equiv. 0,75 mg)', 0.75],
      ],
      'parameter',
    ),
  ],
  decimals: 2,
  unit: 'mg',
  formatValue: (prednisone) => `${formatCompact(prednisone)} mg`,
  compute: (values) =>
    Math.round((requireValue(values, 'dose') / requireValue(values, 'from')) * 5 * 100) / 100,
  details: (prednisone) => [
    { label: 'Hidrocortisona', value: fromPrednisone(prednisone, 4) },
    { label: 'Metilprednisolona', value: fromPrednisone(prednisone, 0.8) },
    { label: 'Dexametasona', value: fromPrednisone(prednisone, 0.15) },
  ],
  interpretation: {
    bands: [],
    otherwise: {
      id: 'prednisona',
      label: 'Equivalência em prednisona',
      tone: 'neutral',
      action:
        'Doses equivalentes em efeito anti-inflamatório. Considere a meia-vida e o efeito mineralocorticoide na troca.',
    },
  },
};

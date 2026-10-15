import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `correçãoNaAdrogueMadias` do ANY. Mesma conta ((Na infusato - Na
 * paciente) / (ACT + 1), 2 casas); o sódio do infusato abre em 513 (NaCl 3%),
 * como lá. O fator de água corporal é parâmetro da fórmula, não ponto, e não
 * vem marcado: o médico escolhe.
 */
export const CORRECAO_NA_ADROGUE: FormulaCalculator = {
  kind: 'formula',
  id: 'correcao-na-adrogue',
  name: 'Correção de Sódio (Adrogué-Madias)',
  aliases: ['adrogue', 'madias', 'sódio', 'hiponatremia', 'correção sódio', 'nacl3'],
  category: 'Renal / Metabólico',
  description: 'Estima a variação de sódio por litro de infusato pela fórmula de Adrogué-Madias.',
  reference: {
    why: 'Fórmula padrão para planejar a correção segura da disnatremia, prevenindo correção excessiva.',
    whenToUse:
      'Pacientes com hiponatremia ou hipernatremia, para calcular a velocidade de correção.',
    pearlsPitfalls: [
      'Variação do Na = (Na infusato - Na paciente) / (água corporal total + 1).',
      'Água corporal total = peso × fator (0,6 homem jovem, 0,5 mulher/homem idoso, 0,45 mulher idosa).',
      'NaCl 3% = 513 mEq/L. SF 0,9% = 154 mEq/L. Ringer lactato ~130 mEq/L.',
      'Não corrigir > 8 mEq/L em 24 h na hiponatremia crônica (risco de mielinólise).',
      'Em hiponatremia grave sintomática: bolus de NaCl 3% 100–150 mL em 10–20 min.',
    ],
    citation: 'Adrogué HJ, Madias NE. Hyponatremia. N Engl J Med. 2000;342(21):1581-9.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    {
      id: 'na_patient',
      label: 'Sódio do paciente',
      unit: 'mEq/L',
      min: 100,
      max: 180,
      step: 1,
    },
    {
      id: 'na_infusate',
      label: 'Sódio do infusato',
      unit: 'mEq/L',
      min: 0,
      max: 855,
      step: 1,
      defaultValue: 513,
    },
    { id: 'weight', label: 'Peso', unit: 'kg', min: 20, max: 200, step: 0.5 },
  ],
  items: [
    choiceItem(
      'sex_age',
      'Sexo / idade (fator de água corporal)',
      [
        ['homem-jovem', 'Homem jovem (0,6)', 0.6],
        ['mulher-jovem', 'Mulher jovem ou homem idoso (0,5)', 0.5],
        ['mulher-idosa', 'Mulher idosa (0,45)', 0.45],
      ],
      'parameter',
    ),
  ],
  decimals: 2,
  unit: 'mEq/L por litro',
  compute: (values) => {
    const totalWater = requireValue(values, 'weight') * requireValue(values, 'sex_age');
    const delta =
      (requireValue(values, 'na_infusate') - requireValue(values, 'na_patient')) / (totalWater + 1);
    return Math.round(delta * 100) / 100;
  },
  interpretation: {
    bands: [],
    otherwise: {
      id: 'variacao',
      label: 'Variação estimada por litro de infusato',
      tone: 'neutral',
      action:
        'Variação estimada do sódio sérico a cada litro do infusato. Meta: não ultrapassar 8 mEq/L em 24 h na hiponatremia crônica. NaCl 3% = 513 mEq/L; SF 0,9% = 154 mEq/L.',
    },
  },
};

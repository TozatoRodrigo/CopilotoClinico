import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Código do sexo no ANY: 1 masculino, 2 feminino. */
const FEMALE = 2;

/**
 * Porte do `ckdEpi` do ANY (CKD-EPI 2021, sem raça). Mesma conta (uma casa)
 * e faixas G1–G5. O sexo é parâmetro (código), não ponto, e não vem marcado.
 */
export const CKD_EPI: FormulaCalculator = {
  kind: 'formula',
  id: 'ckd-epi',
  name: 'CKD-EPI 2021',
  aliases: [
    'ckd-epi',
    'tfg',
    'taxa filtracao glomerular',
    'função renal',
    'estágio renal',
    'doença renal crônica',
  ],
  category: 'Renal / Metabólico',
  description:
    'Taxa de filtração glomerular estimada pela equação CKD-EPI 2021 (sem ajuste racial).',
  reference: {
    why: 'Padrão atual para estimar a TFG e estadiar a doença renal crônica. A versão 2021 não usa raça.',
    whenToUse: 'Avaliação da função renal em adultos, para estadiamento e acompanhamento da DRC.',
    pearlsPitfalls: [
      'O CKD-EPI 2021 não inclui ajuste por raça (recomendação NKF/ASN 2021).',
      'Fórmula: 142 × min(Cr/k, 1)^a × max(Cr/k, 1)^-1,2 × 0,9938^idade × 1,012 (se feminino).',
      'k = 0,7 (F) ou 0,9 (M). a = -0,241 (F) ou -0,302 (M).',
      'TFG < 60 por ≥ 3 meses = doença renal crônica.',
      'Não usar em pacientes em diálise ou com variação aguda da creatinina.',
    ],
    citation:
      'Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med. 2021;385(19):1737-49.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'age', label: 'Idade', unit: 'anos', min: 18, max: 120, step: 1 },
    { id: 'creatinine', label: 'Creatinina sérica', unit: 'mg/dL', min: 0.1, max: 20, step: 0.01 },
  ],
  items: [
    choiceItem(
      'sex',
      'Sexo',
      [
        ['masculino', 'Masculino', 1],
        ['feminino', 'Feminino', FEMALE],
      ],
      'parameter',
    ),
  ],
  decimals: 1,
  unit: 'mL/min/1,73 m²',
  compute: (values) => {
    const female = requireValue(values, 'sex') === FEMALE;
    const k = female ? 0.7 : 0.9;
    const a = female ? -0.241 : -0.302;
    const sexFactor = female ? 1.012 : 1;
    const ratio = requireValue(values, 'creatinine') / k;
    const gfr =
      142 *
      Math.pow(Math.min(ratio, 1), a) *
      Math.pow(Math.max(ratio, 1), -1.2) *
      Math.pow(0.9938, requireValue(values, 'age')) *
      sexFactor;
    return Math.round(gfr * 10) / 10;
  },
  interpretation: {
    bands: [
      {
        id: 'g5',
        upTo: { value: 15, inclusive: false },
        label: 'G5',
        tone: 'critical',
        action: 'Falência renal (G5). Considere diálise ou transplante.',
      },
      {
        id: 'g4',
        upTo: { value: 30, inclusive: false },
        label: 'G4',
        tone: 'critical',
        action: 'Redução grave (G4). Considere preparar para terapia de substituição renal.',
      },
      {
        id: 'g3b',
        upTo: { value: 45, inclusive: false },
        label: 'G3b',
        tone: 'attention',
        action: 'Redução moderada a grave (G3b). Considere nefrologia e ajuste de medicamentos.',
      },
      {
        id: 'g3a',
        upTo: { value: 60, inclusive: false },
        label: 'G3a',
        tone: 'attention',
        action: 'Redução leve a moderada (G3a). Acompanhamento nefrológico recomendado.',
      },
      {
        id: 'g2',
        upTo: { value: 90, inclusive: false },
        label: 'G2',
        tone: 'neutral',
        action: 'Redução leve (G2). Considere monitorar anualmente.',
      },
    ],
    otherwise: {
      id: 'g1',
      label: 'G1',
      tone: 'neutral',
      action:
        'Função renal normal ou elevada (G1). Considere monitorar se houver fatores de risco.',
    },
  },
};

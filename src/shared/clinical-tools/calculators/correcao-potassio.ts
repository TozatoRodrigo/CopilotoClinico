import { byRule, requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `correçãoPotassio` do ANY. Mesma conta (100 mEq a cada 0,3 abaixo
 * de 4,0; zero a partir de 4,0) e a faixa por regra sobre o potássio, como
 * lá: o ANY punha a gravidade só no texto da ação; aqui ela vira o nome da
 * faixa. Ações como sugestão.
 */
export const CORRECAO_POTASSIO: FormulaCalculator = {
  kind: 'formula',
  id: 'correcao-potassio',
  name: 'Correção de potássio (déficit estimado)',
  aliases: ['potássio', 'hipocalemia', 'déficit potássio', 'reposição kcl', 'potássio baixo'],
  category: 'Renal / Metabólico',
  description: 'Estimativa do déficit de potássio corporal total na hipocalemia.',
  reference: {
    why: 'Guia a reposição de potássio estimando o déficit corporal total.',
    whenToUse: 'Pacientes com hipocalemia, para planejar a velocidade e a quantidade de reposição.',
    pearlsPitfalls: [
      'Regra prática: cada 0,3 mEq/L abaixo de 4,0 mEq/L = ~100 mEq de déficit corporal total.',
      'Reposição máxima IV: 10–20 mEq/h em veia periférica, 40 mEq/h em acesso central (com monitoramento).',
      'Não esquecer de corrigir o magnésio simultaneamente: a hipomagnesemia impede a correção do potássio.',
      'Potássio < 2,5 mEq/L: reposição agressiva, ECG contínuo.',
      'Esta fórmula é uma estimativa: o déficit real pode ser maior (potássio intracelular).',
    ],
    citation: 'Gennari FJ. Hypokalemia. N Engl J Med. 1998;339(7):451-8.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [{ id: 'k', label: 'Potássio sérico', unit: 'mEq/L', min: 1, max: 6.5, step: 0.1 }],
  decimals: 0,
  formatValue: (deficit) => `~${deficit} mEq`,
  compute: (values) => {
    const k = requireValue(values, 'k');
    if (k >= 4.0) return 0;
    return Math.round(((4.0 - k) / 0.3) * 100);
  },
  interpretation: byRule(
    [
      {
        id: 'normal',
        label: 'Potássio normal',
        tone: 'neutral',
        action: 'Potássio ≥ 4,0 mEq/L. Sem déficit estimado.',
      },
      {
        id: 'leve',
        label: 'Hipocalemia leve',
        tone: 'attention',
        action: 'Considere reposição oral (KCl 600 mg = 8 mEq) e corrigir o magnésio.',
      },
      {
        id: 'moderada',
        label: 'Hipocalemia moderada',
        tone: 'attention',
        action: 'Considere reposição oral ou IV e verificar o magnésio.',
      },
      {
        id: 'grave',
        label: 'Hipocalemia grave',
        tone: 'critical',
        action: 'Reposição IV recomendada. Considere ECG e monitoramento.',
      },
      {
        id: 'critica',
        label: 'Hipocalemia crítica',
        tone: 'critical',
        action: 'Considere reposição IV urgente com monitoramento contínuo. Risco de arritmia.',
      },
    ],
    (_deficit, values) => {
      const k = requireValue(values, 'k');
      if (k >= 4.0) return 'normal';
      if (k >= 3.5) return 'leve';
      if (k >= 3.0) return 'moderada';
      if (k >= 2.5) return 'grave';
      return 'critica';
    },
  ),
};

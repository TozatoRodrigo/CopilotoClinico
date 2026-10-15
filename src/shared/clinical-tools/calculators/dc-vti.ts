import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `dcVti` do ANY. Mesma conta (área da VSVE × VTI × FC, em L/min,
 * 2 casas) e mesmas faixas; o diâmetro da VSVE abre em 2,0 cm, como lá.
 */
export const DC_VTI: FormulaCalculator = {
  kind: 'formula',
  id: 'dc-vti',
  name: 'Débito Cardíaco por VTI',
  aliases: ['vti', 'débito cardíaco', 'lvot', 'ecocardiograma', 'cardiac output'],
  category: 'Hemodinâmica',
  description: 'Cálculo do débito cardíaco por ecocardiografia (VTI × área da VSVE × FC).',
  reference: {
    why: 'Método não invasivo para estimar o débito cardíaco à beira-leito com eco point-of-care.',
    whenToUse: 'Avaliação hemodinâmica de pacientes críticos com eco point-of-care.',
    pearlsPitfalls: [
      'A VSVE (LVOT) é geralmente medida em janela paraesternal eixo longo (diâmetro em cm).',
      'O VTI é medido na VSVE com Doppler pulsado na janela apical 5 câmaras.',
      'DC normal: 4–8 L/min. IC normal: 2,5–4,0 L/min/m².',
      'Erro mais comum: medida incorreta do diâmetro da VSVE (que é elevado ao quadrado).',
    ],
    citation:
      'Defined by echocardiographic hemodynamic principles. Ref: Oh JK et al. The Echo Manual. 3rd ed.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'vti', label: 'VTI (VSVE)', unit: 'cm', min: 1, max: 50, step: 0.1 },
    {
      id: 'lvot',
      label: 'Diâmetro da VSVE',
      unit: 'cm',
      min: 0.5,
      max: 4,
      step: 0.1,
      defaultValue: 2,
    },
    { id: 'hr', label: 'Frequência cardíaca', unit: 'bpm', min: 20, max: 250, step: 1 },
  ],
  decimals: 2,
  unit: 'L/min',
  compute: (values) => {
    const area = Math.PI * Math.pow(requireValue(values, 'lvot') / 2, 2);
    const strokeVolume = area * requireValue(values, 'vti'); // cm³ = mL
    const output = (strokeVolume * requireValue(values, 'hr')) / 1000; // L/min
    return Math.round(output * 100) / 100;
  },
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 2.5, inclusive: false },
        label: 'Baixo',
        tone: 'critical',
        action: 'Débito cardíaco reduzido. Considere causas de baixo débito e suporte inotrópico.',
      },
      {
        id: 'borderline',
        upTo: { value: 4, inclusive: true },
        label: 'Borderline',
        tone: 'attention',
        action: 'Débito cardíaco no limite inferior. Considere o contexto clínico.',
      },
      {
        id: 'normal',
        upTo: { value: 8, inclusive: true },
        label: 'Normal',
        tone: 'neutral',
        action: 'Débito cardíaco dentro da faixa normal (4–8 L/min).',
      },
    ],
    otherwise: {
      id: 'elevado',
      label: 'Elevado',
      tone: 'attention',
      action:
        'Débito cardíaco elevado. Considere estados hiperdinâmicos (sepse, anemia, hipertireoidismo).',
    },
  },
};

import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/** QTc de Fridericia (ms, inteiro), a mesma conta que o ANY mostrava no rótulo. */
function fridericia(values: Readonly<Record<string, number>>): number {
  const rr = 60 / requireValue(values, 'hr');
  return Math.round((requireValue(values, 'qt') / 1000 / Math.pow(rr, 1 / 3)) * 1000);
}

/**
 * Porte do `qtcCorrigido` do ANY. O valor é o QTc de Bazett (ms, inteiro) e as
 * faixas são lidas sobre ele, como lá; o de Fridericia sai como detalhe. As
 * ações viraram sugestão.
 */
export const QTC_CORRIGIDO: FormulaCalculator = {
  kind: 'formula',
  id: 'qtc-corrigido',
  name: 'QTc corrigido (Bazett e Fridericia)',
  aliases: ['qtc', 'qt corrigido', 'bazett', 'fridericia', 'intervalo qt', 'arritmia', 'torsades'],
  category: 'Toxicologia',
  description: 'Calcula o intervalo QT corrigido pela frequência cardíaca.',
  reference: {
    why: 'QTc prolongado (> 500 ms) está associado a risco de torsades de pointes e morte súbita.',
    whenToUse:
      'Avaliação do ECG em pacientes com medicamentos que prolongam o QT ou com suspeita de intoxicação.',
    pearlsPitfalls: [
      'Bazett: QTc = QT / raiz quadrada do RR (em segundos). Mais usado, mas impreciso em FC extremas.',
      'Fridericia: QTc = QT / raiz cúbica do RR. Mais preciso em taquicardia e bradicardia.',
      'QTc normal: < 440 ms (homens), < 460 ms (mulheres).',
      'QTc > 500 ms: risco significativo de torsades. Revisar medicamentos e eletrólitos.',
      'Drogas comuns que prolongam o QT: haloperidol, ondansetrona, amiodarona, fluoroquinolonas, metadona.',
    ],
    citation:
      'Bazett HC. An analysis of the time-relations of electrocardiograms. Heart. 1920;7:353-70. Fridericia LS. Die Systolendauer im Elektrokardiogramm bei normalen Menschen und bei Herzkranken. Acta Med Scand. 1920;53:469-86.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'qt', label: 'Intervalo QT medido', unit: 'ms', min: 200, max: 800, step: 1 },
    { id: 'hr', label: 'Frequência cardíaca', unit: 'bpm', min: 30, max: 250, step: 1 },
  ],
  decimals: 0,
  unit: 'ms',
  compute: (values) => {
    const rr = 60 / requireValue(values, 'hr'); // RR em segundos
    const qtSeconds = requireValue(values, 'qt') / 1000;
    return Math.round((qtSeconds / Math.sqrt(rr)) * 1000);
  },
  details: (_value, values) => [{ label: 'QTc de Fridericia', value: `${fridericia(values)} ms` }],
  interpretation: {
    bands: [
      {
        id: 'normal',
        upTo: { value: 440, inclusive: false },
        label: 'Normal',
        tone: 'neutral',
        action: 'QTc dentro dos limites normais. Sem risco aumentado de arritmia.',
      },
      {
        id: 'prolongado',
        upTo: { value: 500, inclusive: false },
        label: 'Prolongado',
        tone: 'attention',
        action:
          'QTc prolongado. Considere revisar medicamentos e eletrólitos (K+, Mg2+, Ca2+) e monitorar.',
      },
    ],
    otherwise: {
      id: 'muito-prolongado',
      label: 'Muito prolongado',
      tone: 'critical',
      action:
        'QTc > 500 ms. Risco significativo de torsades de pointes. Considere suspender drogas que prolongam o QT, corrigir eletrólitos e magnésio IV profilático.',
    },
  },
};

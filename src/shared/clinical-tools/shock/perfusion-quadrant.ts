import type { NumericInput } from '../calculator';
import { formatCompact } from '../numbers';
import { validateNumber, type NumericFieldError } from '../ranges';
import type { ResultTone } from '../tone';

/**
 * Quadrante gap CO2 × SvcO2 (Ltaief et al. 2021), porte do `getQuadrant` do
 * ANY, da grade de quadrantes e do texto de conduta do ShockPath. O ANY
 * escreve ScvO2; no Copiloto é SvcO2 (saturação venosa central de O2), como
 * nos protocolos brasileiros.
 */

export const PERFUSION_THRESHOLDS = {
  /** SvcO2 abaixo disso é baixa (%). */
  svco2: 70,
  /** Gap CO2 acima disso é alargado (mmHg). */
  gapCO2: 6,
} as const;

export const PERFUSION_INPUTS = {
  svco2: { id: 'svco2', label: 'SvcO2', unit: '%', min: 1, max: 100, step: 0.1 },
  gapCO2: { id: 'gapCO2', label: 'Gap CO2', unit: 'mmHg', min: 0, max: 40, step: 0.1 },
} as const satisfies Record<string, NumericInput>;

export type PerfusionInputId = keyof typeof PERFUSION_INPUTS;

export type PerfusionQuadrantId =
  | 'baixo-debito'
  | 'disoxia-anemica'
  | 'microcirculacao-inadequada'
  | 'hipoxia-citopatica';

export interface PerfusionQuadrant {
  id: PerfusionQuadrantId;
  /** Nome do resultado (o `label` do `getQuadrant`). */
  label: string;
  /**
   * Tom do ADR-017. A hipóxia citopática é azul no resultado do ANY e cinza na
   * grade; aqui vira neutro. Está na revisão clínica.
   */
  tone: ResultTone;
  /** Conduta sugerida (`getQuadrantConductText`). */
  conduct: string;
  /** Célula da grade 2 × 2. */
  cell: { title: string; criteria: string; hint: string };
}

/** Na ordem da grade do ANY: baixo débito, disóxia, microcirculação, citopática. */
export const PERFUSION_QUADRANTS: readonly PerfusionQuadrant[] = [
  {
    id: 'baixo-debito',
    label: 'Baixo débito cardíaco / estase',
    tone: 'critical',
    conduct:
      'Considere inotrópico (dobutamina 5-20 mcg/kg/min), ecocardiograma para guiar a terapia e checar a volemia (Ltaief et al. Critical Care 2021).',
    cell: {
      title: 'Baixo débito / estase',
      criteria: 'SvcO2 < 70% + Gap > 6',
      hint: 'Considere inotrópico',
    },
  },
  {
    id: 'disoxia-anemica',
    label: 'Disóxia anêmica',
    tone: 'attention',
    conduct:
      'Considere checar a hemoglobina (transfusão se Hb < 7 g/dL) e a SaO2 e otimizar a oferta de oxigênio (Ltaief et al. Critical Care 2021).',
    cell: {
      title: 'Disóxia anêmica/hipóxica',
      criteria: 'SvcO2 < 70% + Gap ≤ 6',
      hint: 'Considere checar Hb e SaO2',
    },
  },
  {
    id: 'microcirculacao-inadequada',
    label: 'Microcirculação inadequada',
    tone: 'attention',
    conduct:
      'Considere otimizar a perfusão periférica, vasodilatadores se a PAM estiver adequada e avaliar a microcirculação (Ltaief et al. Critical Care 2021).',
    cell: {
      title: 'Microcirculação inadequada',
      criteria: 'SvcO2 ≥ 70% + Gap > 6',
      hint: 'Considere otimizar a perfusão',
    },
  },
  {
    id: 'hipoxia-citopatica',
    label: 'Hipóxia citopática',
    tone: 'neutral',
    conduct:
      'Dano mitocondrial provável. Suporte clínico. Considere limitação terapêutica conforme o contexto (Ltaief et al. Critical Care 2021).',
    cell: {
      title: 'Hipóxia citopática',
      criteria: 'SvcO2 ≥ 70% + Gap ≤ 6',
      hint: 'Suporte',
    },
  },
];

const BY_ID = new Map(PERFUSION_QUADRANTS.map((quadrant) => [quadrant.id, quadrant]));

export function getPerfusionQuadrant(id: PerfusionQuadrantId): PerfusionQuadrant {
  const quadrant = BY_ID.get(id);
  if (!quadrant) throw new Error(`Quadrante desconhecido: ${id}`);
  return quadrant;
}

/** Mesma ordem de testes do `getQuadrant`: SvcO2 < 70 e gap > 6 decidem. */
export function classifyPerfusion(svco2: number, gapCO2: number): PerfusionQuadrant {
  const lowSvco2 = svco2 < PERFUSION_THRESHOLDS.svco2;
  const wideGap = gapCO2 > PERFUSION_THRESHOLDS.gapCO2;
  if (lowSvco2 && wideGap) return getPerfusionQuadrant('baixo-debito');
  if (lowSvco2) return getPerfusionQuadrant('disoxia-anemica');
  if (wideGap) return getPerfusionQuadrant('microcirculacao-inadequada');
  return getPerfusionQuadrant('hipoxia-citopatica');
}

/** "SvcO2 65% + Gap CO2 8,5 mmHg", como a caixa de resultado do ANY. */
export function describePerfusionInputs(svco2: number, gapCO2: number): string {
  return `SvcO2 ${formatCompact(svco2, 1)}% + Gap CO2 ${formatCompact(gapCO2, 1)} mmHg`;
}

export type PerfusionEvaluation =
  | {
      status: 'pending';
      missing: readonly string[];
      errors: Readonly<Partial<Record<PerfusionInputId, NumericFieldError>>>;
    }
  | {
      status: 'complete';
      quadrant: PerfusionQuadrant;
      svco2: number;
      gapCO2: number;
    };

/**
 * Resultado ao vivo (ADR-017): no ANY era preciso tocar em "Interpretar" e o
 * quadrante ficava velho se o valor mudasse depois. Aqui ele acompanha o que
 * está digitado.
 */
export function evaluatePerfusion(
  raw: Readonly<Record<PerfusionInputId, string>>,
): PerfusionEvaluation {
  const missing: string[] = [];
  const errors: Partial<Record<PerfusionInputId, NumericFieldError>> = {};
  const values: Partial<Record<PerfusionInputId, number>> = {};
  for (const id of Object.keys(PERFUSION_INPUTS) as PerfusionInputId[]) {
    const input = PERFUSION_INPUTS[id];
    const checked = validateNumber(raw[id], input);
    if (checked.ok) values[id] = checked.value;
    else if (checked.error.kind === 'empty') missing.push(input.label);
    else errors[id] = checked.error;
  }
  const { svco2, gapCO2 } = values;
  if (svco2 === undefined || gapCO2 === undefined) {
    return { status: 'pending', missing, errors };
  }
  return { status: 'complete', quadrant: classifyPerfusion(svco2, gapCO2), svco2, gapCO2 };
}

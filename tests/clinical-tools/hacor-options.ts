import type { CalculatorAnswers, ScoreItem } from '../../src/shared/clinical-tools/calculator';
import { HACOR } from '../../src/shared/clinical-tools/ventilation/hacor';

/**
 * Escolhe a opção do HACOR que o médico tocaria para um valor medido, lendo
 * o rótulo da opção ("≥ 7,35", "13-14", "≤ 10"). Serve para comparar com o
 * `calcHACOR` do ANY, que recebe valores, e para portar os testes antigos.
 * Se nenhuma ou mais de uma opção servir, o rótulo tem buraco ou sobreposição
 * na grade medida, e o teste falha alto.
 */

function number(text: string): number {
  return Number(text.trim().replace(',', '.'));
}

function matches(label: string, value: number): boolean {
  const comparison = label.match(/^(≥|≤|<|>)\s*(.+)$/);
  if (comparison) {
    const [, operator, limit = ''] = comparison;
    const bound = number(limit);
    if (operator === '≥') return value >= bound;
    if (operator === '≤') return value <= bound;
    if (operator === '<') return value < bound;
    return value > bound;
  }
  const range = label.match(/^([\d,]+)-([\d,]+)$/);
  if (range) {
    const [, low = '', high = ''] = range;
    return value >= number(low) && value <= number(high);
  }
  return value === number(label);
}

function optionFor(item: ScoreItem, value: number): string {
  const found = item.options.filter(({ label }) => matches(label, value));
  if (found.length !== 1) {
    throw new Error(`HACOR ${item.id}=${value}: ${found.length} opções servem`);
  }
  return found[0]?.id ?? '';
}

function item(id: string): ScoreItem {
  const found = HACOR.items.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Item ${id} ausente no HACOR`);
  return found;
}

export interface HacorMeasurements {
  /** FC acima do corte do item (o ANY recebia só sim/não). */
  tachycardia: boolean;
  ph: number;
  gcs: number;
  pf: number;
  respiratoryRate: number;
}

export function hacorAnswersFor(measured: HacorMeasurements): CalculatorAnswers {
  return {
    items: {
      fc: measured.tachycardia ? 'sim' : 'nao',
      ph: optionFor(item('ph'), measured.ph),
      gcs: optionFor(item('gcs'), measured.gcs),
      pf: optionFor(item('pf'), measured.pf),
      fr: optionFor(item('fr'), measured.respiratoryRate),
    },
  };
}

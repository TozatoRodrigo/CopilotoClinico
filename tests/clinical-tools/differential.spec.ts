import { describe, expect, it } from 'vitest';
import { ALL_CALCULATORS, type Calculator as AnyCalculator } from '../any-reference/calculatorData';
import { ADULT_WEIGHT_RANGE, PED_WEIGHT_RANGE } from '../any-reference/clinical';
import { fmt, fmtDose, fmtMlh, fmtWeight } from '../any-reference/formatters';
import {
  evaluateCalculator,
  type CalculatorDefinition,
  type FormulaCalculator,
  type ScoreItem,
} from '../../src/shared/clinical-tools/calculator';
import {
  formatDecimal,
  formatQuantity,
  formatWeight,
} from '../../src/shared/clinical-tools/numbers';
import { WEIGHT_RANGES } from '../../src/shared/clinical-tools/ranges';
import { CALCULATORS, getCalculator } from '../../src/shared/clinical-tools/registry';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-303 — cada função portada do ANY dá o mesmo resultado da referência
 * congelada (tests/any-reference) em 1.000 entradas aleatórias dentro das
 * faixas válidas. Escores pequenos também são conferidos em todas as
 * combinações possíveis.
 *
 * O que se compara: o valor (com a tolerância declarada abaixo), o nome da
 * faixa e o tom. O texto da ação não entra: ele passou pela regra de
 * linguagem do ADR-017 e é conferido na revisão clínica (CC-310).
 */

/** ADR-017, "Cores": o verde do ANY vira neutro, o amarelo vira laranja (atenção), o vermelho fica. */
const ANY_COLOR_TONE: Record<string, ResultTone> = {
  '#4CAF50': 'neutral',
  '#FFC107': 'attention',
  '#F44336': 'critical',
};

interface Port {
  id: string;
  /** Diferença absoluta aceita no valor. 0 = mesma aritmética, resultado idêntico. */
  tolerance: number;
  /** Nome da faixa dentro do rótulo do ANY, quando ele embute o valor ("IC: 1.22 — choque provável"). */
  anyBandName?: (label: string) => string;
}

const PORTS: readonly Port[] = [
  { id: 'chadsvasc', tolerance: 0 },
  { id: 'has-bled', tolerance: 0 },
  { id: 'qsofa', tolerance: 0 },
  { id: 'curb65', tolerance: 0 },
  { id: 'shock-index', tolerance: 0, anyBandName: (label) => label.split(' — ')[1] ?? label },
];

/** Casos fixos nas bordas das faixas, além dos aleatórios. */
const FORMULA_EDGES: Record<string, readonly Record<string, number>[]> = {
  'shock-index': [
    { hr: 69, sbp: 100 },
    { hr: 70, sbp: 100 },
    { hr: 139, sbp: 200 }, // 0,695 arredonda para 0,7
    { hr: 89, sbp: 100 },
    { hr: 90, sbp: 100 },
    { hr: 129, sbp: 100 },
    { hr: 130, sbp: 100 },
    { hr: 30, sbp: 300 },
    { hr: 250, sbp: 40 },
  ],
};

const SEED = 20261014;
const EXHAUSTIVE_LIMIT = 10_000;

function normalizeBandName(label: string): string {
  return label.replace(/>=/g, '≥').replace(/<=/g, '≤').trim().toLowerCase();
}

function referenceFor(id: string): AnyCalculator {
  const reference = ALL_CALCULATORS.find((calculator: AnyCalculator) => calculator.id === id);
  if (!reference) throw new Error(`Sem referência do ANY para ${id}`);
  return reference;
}

interface Mismatch {
  case: string;
  expected: unknown;
  received: unknown;
}

function compare(
  port: Port,
  definition: CalculatorDefinition,
  reference: AnyCalculator,
  caseLabel: string,
  anyValue: number,
  anyValues: Record<string, number>,
  result: ReturnType<typeof evaluateCalculator>,
): Mismatch | null {
  const anyInterpretation = reference.interpret(anyValue, anyValues);
  const expected = {
    value: anyValue,
    band: normalizeBandName(
      (port.anyBandName ?? ((label: string) => label))(anyInterpretation.label),
    ),
    tone: ANY_COLOR_TONE[anyInterpretation.color],
  };
  if (result.status !== 'complete') {
    return { case: caseLabel, expected, received: result };
  }
  const received = {
    value: result.value,
    band: normalizeBandName(result.band.label),
    tone: result.band.tone,
  };
  const sameValue = Math.abs(received.value - expected.value) <= port.tolerance;
  if (!sameValue || received.band !== expected.band || received.tone !== expected.tone) {
    return { case: caseLabel, expected, received };
  }
  return null;
}

function* everyCombination(items: readonly ScoreItem[]): Generator<number[]> {
  const sizes = items.map((item) => item.options.length);
  const current = sizes.map(() => 0);
  while (true) {
    yield [...current];
    let position = current.length - 1;
    while (position >= 0) {
      const size = sizes[position] ?? 1;
      current[position] = ((current[position] ?? 0) + 1) % size;
      if (current[position] !== 0) break;
      position -= 1;
    }
    if (position < 0) return;
  }
}

function runScoreCase(
  port: Port,
  definition: CalculatorDefinition,
  reference: AnyCalculator,
  choice: readonly number[],
  caseLabel: string,
): Mismatch | null {
  const items = definition.items ?? [];
  const answers: Record<string, string> = {};
  const anyValues: Record<string, number> = {};
  let anyScore = 0;
  items.forEach((item, index) => {
    const optionIndex = choice[index] ?? 0;
    const option = item.options[optionIndex];
    const anyOption = reference.items?.[index]?.options[optionIndex];
    if (!option || !anyOption) throw new Error(`Opção ${optionIndex} ausente em ${item.id}`);
    answers[item.id] = option.id;
    anyValues[item.id] = anyOption.value;
    anyScore += anyOption.value;
  });
  const result = evaluateCalculator(definition, { items: answers });
  return compare(port, definition, reference, caseLabel, anyScore, anyValues, result);
}

function runFormulaCase(
  port: Port,
  definition: FormulaCalculator,
  reference: AnyCalculator,
  values: Record<string, number>,
  caseLabel: string,
): Mismatch | null {
  if (!reference.formula) throw new Error(`${reference.id} não é fórmula no ANY`);
  const anyValue = reference.formula(values);
  // O médico digita com vírgula: o caso passa pelo mesmo parser da tela.
  const inputs = Object.fromEntries(
    Object.entries(values).map(([id, value]) => [id, String(value).replace('.', ',')]),
  );
  const result = evaluateCalculator(definition, { inputs });
  return compare(port, definition, reference, caseLabel, anyValue, values, result);
}

describe('teste diferencial contra o ANY — calculadoras', () => {
  it('toda calculadora portada tem teste diferencial', () => {
    expect(PORTS.map(({ id }) => id).sort()).toEqual(CALCULATORS.map(({ id }) => id).sort());
  });

  describe.each(PORTS.map((port) => [port.id, port] as const))('%s', (id, port) => {
    const definition = getCalculator(id);
    const reference = referenceFor(id);
    if (!definition) throw new Error(`${id} não está no registro`);

    it('tem os mesmos itens, opções, pontos e faixas de entrada do ANY', () => {
      const items = definition.items ?? [];
      expect(items.map((item) => item.id)).toEqual((reference.items ?? []).map((item) => item.id));
      items.forEach((item, index) => {
        const anyItem = reference.items?.[index];
        expect(
          item.options.map(({ points }) => points),
          item.id,
        ).toEqual(anyItem?.options.map(({ value }) => value));
      });
      if (definition.kind === 'formula') {
        expect(
          definition.inputs.map(({ id: inputId, min, max, step, unit }) => ({
            id: inputId,
            min,
            max,
            step,
            unit,
          })),
        ).toEqual(
          (reference.inputs ?? []).map(({ id: inputId, min, max, step, unit }) => ({
            id: inputId,
            min,
            max,
            step,
            unit,
          })),
        );
      }
    });

    it(`dá o mesmo valor, faixa e tom em ${DIFFERENTIAL_CASES} entradas aleatórias`, () => {
      const random = seededRandom(SEED);
      const mismatches: Mismatch[] = [];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        const caseLabel = `semente ${SEED}, caso ${index}`;
        const mismatch =
          definition.kind === 'formula'
            ? runFormulaCase(
                port,
                definition,
                reference,
                Object.fromEntries(
                  definition.inputs.map((input) => [
                    input.id,
                    random.onGrid(input.min, input.max, input.step),
                  ]),
                ),
                caseLabel,
              )
            : runScoreCase(
                port,
                definition,
                reference,
                definition.items.map((item) => random.integer(0, item.options.length - 1)),
                caseLabel,
              );
        if (mismatch) mismatches.push(mismatch);
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });

    it('dá o mesmo resultado nas bordas (todas as combinações, ou os limites das faixas)', () => {
      const mismatches: Mismatch[] = [];
      if (definition.kind === 'formula') {
        for (const values of FORMULA_EDGES[id] ?? []) {
          const mismatch = runFormulaCase(
            port,
            definition,
            reference,
            { ...values },
            JSON.stringify(values),
          );
          if (mismatch) mismatches.push(mismatch);
        }
        expect(FORMULA_EDGES[id]?.length ?? 0).toBeGreaterThan(0);
      } else {
        const total = definition.items.reduce((product, item) => product * item.options.length, 1);
        expect(total).toBeLessThanOrEqual(EXHAUSTIVE_LIMIT);
        for (const choice of everyCombination(definition.items)) {
          const mismatch = runScoreCase(port, definition, reference, choice, choice.join(','));
          if (mismatch) mismatches.push(mismatch);
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });
  });
});

describe('teste diferencial contra o ANY — números e unidades', () => {
  const random = seededRandom(SEED + 1);

  it(`formatDecimal = fmt em ${DIFFERENTIAL_CASES} valores`, () => {
    const special = [0, -0, 0.05, 1.005, 2.5, -2.5, 1e6, Number.NaN];
    for (const value of special) {
      for (let decimals = 0; decimals <= 3; decimals += 1) {
        expect(formatDecimal(value, decimals), `${value}/${decimals}`).toBe(fmt(value, decimals));
      }
    }
    expect(formatDecimal(null)).toBe(fmt(null));
    expect(formatDecimal(undefined)).toBe(fmt(undefined));
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const magnitude = 10 ** random.integer(-3, 4);
      const value = (random.next() < 0.1 ? -1 : 1) * random.next() * magnitude;
      const decimals = random.integer(0, 4);
      expect(formatDecimal(value, decimals), `caso ${index}: ${value}`).toBe(fmt(value, decimals));
    }
  });

  it(`formatWeight = fmtWeight e formatQuantity = fmtDose/fmtMlh em ${DIFFERENTIAL_CASES} valores`, () => {
    expect(formatWeight(null)).toBe(fmtWeight(null));
    expect(formatWeight(0)).toBe(fmtWeight(0));
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const weight = random.onGrid(0.5, 200, 0.1);
      expect(formatWeight(weight), `peso ${weight}`).toBe(fmtWeight(weight));
      const dose = random.next() * 50;
      const decimals = random.integer(0, 3);
      const unit = random.pick(['mcg/kg/min', 'mg/kg/h', 'UI/min', 'mcg/min']);
      expect(formatQuantity(dose, unit, decimals)).toBe(fmtDose(dose, unit, decimals));
      expect(formatQuantity(dose, 'mL/h', decimals)).toBe(fmtMlh(dose, decimals));
    }
  });

  it('usa as faixas de peso do ANY', () => {
    expect([WEIGHT_RANGES.adulto.min, WEIGHT_RANGES.adulto.max]).toEqual([
      ADULT_WEIGHT_RANGE.min,
      ADULT_WEIGHT_RANGE.max,
    ]);
    expect([WEIGHT_RANGES.pediatrico.min, WEIGHT_RANGES.pediatrico.max]).toEqual([
      PED_WEIGHT_RANGE.min,
      PED_WEIGHT_RANGE.max,
    ]);
  });
});

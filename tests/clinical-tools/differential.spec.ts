import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ALL_CALCULATORS, type Calculator as AnyCalculator } from '../any-reference/calculatorData';
import { ADULT_WEIGHT_RANGE, PED_WEIGHT_RANGE } from '../any-reference/clinical';
import { fmt, fmtDose, fmtMlh, fmtWeight } from '../any-reference/formatters';
import {
  evaluateCalculator,
  findBand,
  isRuleInterpretation,
  type CalculatorDefinition,
  type CalculatorEvaluation,
  type ScoreItem,
} from '../../src/shared/clinical-tools/calculator';
import { CALCULATOR_CATALOG } from '../../src/shared/clinical-tools/calculator-catalog';
import { normalizeSearchText } from '../../src/shared/clinical-tools/catalog';
import {
  formatDecimal,
  formatQuantity,
  formatWeight,
} from '../../src/shared/clinical-tools/numbers';
import { WEIGHT_RANGES } from '../../src/shared/clinical-tools/ranges';
import { CALCULATORS, getCalculator } from '../../src/shared/clinical-tools/registry';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import { PORTS, type AnyInterpretation, type Port } from './ports';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-303 a CC-309 — cada calculadora portada do ANY dá o mesmo resultado da
 * referência congelada (tests/any-reference) em 1.000 entradas aleatórias
 * dentro das faixas válidas. Escores pequenos também são conferidos em todas
 * as combinações possíveis; nos grandes (NIHSS, APACHE II), toda soma
 * alcançável passa pela faixa. Fórmulas têm casos fixos nas bordas.
 *
 * O que se compara: o valor (com a tolerância declarada em ports.ts), o nome
 * da faixa e o tom. O texto da ação não entra: ele passou pela regra de
 * linguagem do ADR-017 e é conferido na revisão clínica (CC-310).
 */

/**
 * ADR-017, "Cores": o verde do ANY vira neutro, o amarelo vira laranja
 * (atenção), o vermelho fica. O laranja do ANY (#FF9800, ICH 3 e ABC/2 ≥ 30
 * mL) fica entre o amarelo e o vermelho e vira atenção, o laranja do design
 * system; o azul informativo (#2196F3, Parkland, DPP) não é risco e fica neutro.
 */
const ANY_COLOR_TONE: Record<string, ResultTone> = {
  '#4CAF50': 'neutral',
  '#FFC107': 'attention',
  '#FF9800': 'attention',
  '#F44336': 'critical',
  '#2196F3': 'neutral',
};

const SEED = 20261014;
const EXHAUSTIVE_LIMIT = 10_000;
/** Data fixa para as contas que dependem do dia (idade gestacional, DPP). */
const FIXED_NOW = new Date(2026, 9, 14, 10, 30);

/**
 * Nome da faixa sem o que muda entre os dois lados por acentuação e
 * tipografia: "Deficit" × "Déficit", ">=" × "≥", "3-8" × "3–8".
 */
function normalizeBandName(label: string): string {
  return normalizeSearchText(
    label.replace(/>=/g, '≥').replace(/<=/g, '≤').replace(/[–—]/g, '-').replace(/\s+/g, ' '),
  );
}

function referenceFor(id: string): AnyCalculator {
  const anyId = CALCULATOR_CATALOG.find((entry) => entry.id === id)?.anyId ?? id;
  const reference = ALL_CALCULATORS.find((calculator: AnyCalculator) => calculator.id === anyId);
  if (!reference) throw new Error(`Sem referência do ANY para ${id}`);
  return reference;
}

/** Itens do ANY que correspondem aos itens da definição: `items` nos escores, `selects` nas fórmulas. */
function referenceItems(
  definition: CalculatorDefinition,
  reference: AnyCalculator,
): { id: string; options: { value: number | string }[] }[] {
  return (definition.kind === 'formula' ? reference.selects : reference.items) ?? [];
}

interface Mismatch {
  case: string;
  expected: unknown;
  received: unknown;
}

function compare(
  port: Port,
  reference: AnyCalculator,
  caseLabel: string,
  anyValue: number,
  anyValues: Record<string, number>,
  result: CalculatorEvaluation,
): Mismatch | null {
  const anyInterpretation: AnyInterpretation = reference.interpret(anyValue, anyValues);
  if (port.anyPending?.(anyInterpretation, anyValues)) {
    // O ANY mostra "confira a data" como se fosse resultado; aqui não calcula.
    const inconsistent =
      result.status === 'pending' &&
      Object.values(result.errors).some((error) => error.kind === 'inconsistent');
    return inconsistent
      ? null
      : { case: caseLabel, expected: `pendente (${anyInterpretation.label})`, received: result };
  }
  const expectedValue = port.anyValue
    ? port.anyValue(anyValue, anyValues, anyInterpretation)
    : anyValue;
  const expected = {
    value: expectedValue,
    band: normalizeBandName(
      port.anyBandName
        ? port.anyBandName(anyInterpretation, anyValue, anyValues)
        : anyInterpretation.label,
    ),
    tone: ANY_COLOR_TONE[anyInterpretation.color],
  };
  if (result.status !== 'complete') {
    return { case: caseLabel, expected, received: result };
  }
  const received = {
    value: expectedValue === null ? null : result.value,
    band: normalizeBandName(result.band.label),
    tone: result.band.tone,
  };
  const sameValue =
    expectedValue === null || Math.abs(result.value - expectedValue) <= port.tolerance;
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

/** Respostas dos itens pela posição da opção, nos dois formatos: o do porte e o do ANY. */
function answerItems(
  definition: CalculatorDefinition,
  reference: AnyCalculator,
  choice: readonly number[],
): { answers: Record<string, string>; anyValues: Record<string, number>; anySum: number } {
  const anyItems = referenceItems(definition, reference);
  const answers: Record<string, string> = {};
  const anyValues: Record<string, number> = {};
  let anySum = 0;
  (definition.items ?? []).forEach((item, index) => {
    const optionIndex = choice[index] ?? 0;
    const option = item.options[optionIndex];
    const anyItem = anyItems[index];
    const anyOption = anyItem?.options[optionIndex];
    if (!option || !anyItem || !anyOption) {
      throw new Error(`Opção ${optionIndex} ausente em ${item.id}`);
    }
    answers[item.id] = option.id;
    anyValues[anyItem.id] = Number(anyOption.value);
    anySum += Number(anyOption.value);
  });
  return { answers, anyValues, anySum };
}

function runScoreCase(
  port: Port,
  definition: CalculatorDefinition,
  reference: AnyCalculator,
  choice: readonly number[],
  caseLabel: string,
): Mismatch | null {
  const { answers, anyValues, anySum } = answerItems(definition, reference, choice);
  const result = evaluateCalculator(definition, { items: answers }, { today: new Date() });
  return compare(port, reference, caseLabel, anySum, anyValues, result);
}

function runFormulaCase(
  port: Port,
  definition: CalculatorDefinition,
  reference: AnyCalculator,
  inputs: Record<string, number>,
  choice: readonly number[],
  caseLabel: string,
): Mismatch | null {
  if (!reference.formula) throw new Error(`${reference.id} não é fórmula no ANY`);
  const { answers, anyValues } = answerItems(definition, reference, choice);
  const all = { ...inputs, ...anyValues };
  const anyValue = reference.formula(all);
  // O médico digita com vírgula: o caso passa pelo mesmo parser da tela.
  const typed = Object.fromEntries(
    Object.entries(inputs).map(([id, value]) => [id, String(value).replace('.', ',')]),
  );
  const result = evaluateCalculator(
    definition,
    { inputs: typed, items: answers },
    { today: new Date() },
  );
  return compare(port, reference, caseLabel, anyValue, all, result);
}

/** Somas alcançáveis de um escore (programação dinâmica sobre os itens). */
function reachableSums(items: readonly ScoreItem[]): number[] {
  let sums = new Set([0]);
  for (const item of items) {
    const next = new Set<number>();
    for (const sum of sums) for (const option of item.options) next.add(sum + option.points);
    sums = next;
  }
  return [...sums].sort((a, b) => a - b);
}

describe('teste diferencial contra o ANY — calculadoras', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('toda calculadora portada tem teste diferencial', () => {
    expect(PORTS.map(({ id }) => id).sort()).toEqual(CALCULATORS.map(({ id }) => id).sort());
  });

  describe.each(PORTS.map((port) => [port.id, port] as const))('%s', (id, port) => {
    const definition = getCalculator(id);
    const reference = referenceFor(id);
    if (!definition) throw new Error(`${id} não está no registro`);
    const items = definition.items ?? [];

    it('tem os mesmos itens, opções, pontos e faixas de entrada do ANY', () => {
      const anyItems = referenceItems(definition, reference);
      // Só a acentuação do id pode mudar ("náusea" → "nausea").
      expect(items.map((item) => normalizeSearchText(item.id))).toEqual(
        anyItems.map((item) => normalizeSearchText(item.id)),
      );
      items.forEach((item, index) => {
        expect(
          item.options.map(({ points }) => points),
          item.id,
        ).toEqual(anyItems[index]?.options.map(({ value }) => Number(value)));
      });
      if (definition.kind === 'formula') {
        expect(
          definition.inputs.map(({ id: inputId, min, max, step, unit, defaultValue }) => ({
            id: inputId,
            min,
            max,
            step,
            unit,
            defaultValue,
          })),
        ).toEqual(
          (reference.inputs ?? []).map(({ id: inputId, min, max, step, unit, defaultValue }) => ({
            id: inputId,
            min,
            max,
            step,
            unit,
            defaultValue,
          })),
        );
      }
    });

    it(`dá o mesmo valor, faixa e tom em ${DIFFERENTIAL_CASES} entradas aleatórias`, () => {
      const random = seededRandom(SEED);
      const mismatches: Mismatch[] = [];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        const caseLabel = `semente ${SEED}, caso ${index}`;
        const choice = items.map((item) => random.integer(0, item.options.length - 1));
        const mismatch =
          definition.kind === 'formula'
            ? runFormulaCase(
                port,
                definition,
                reference,
                port.randomInputs
                  ? port.randomInputs(random)
                  : Object.fromEntries(
                      definition.inputs.map((input) => [
                        input.id,
                        random.onGrid(input.min, input.max, input.step),
                      ]),
                    ),
                choice,
                caseLabel,
              )
            : runScoreCase(port, definition, reference, choice, caseLabel);
        if (mismatch) mismatches.push(mismatch);
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });

    it('dá o mesmo resultado nas bordas (todas as combinações, ou os limites das faixas)', () => {
      const mismatches: Mismatch[] = [];
      if (definition.kind === 'formula') {
        const edges = port.edges ?? [];
        expect(edges.length).toBeGreaterThan(0);
        for (const edge of edges) {
          const inputs = Object.fromEntries(
            definition.inputs.map((input) => [input.id, edge[input.id] ?? input.min]),
          );
          const choice = items.map((item) => edge[item.id] ?? 0);
          const mismatch = runFormulaCase(
            port,
            definition,
            reference,
            inputs,
            choice,
            JSON.stringify(edge),
          );
          if (mismatch) mismatches.push(mismatch);
        }
        expect(mismatches.slice(0, 5)).toEqual([]);
        return;
      }

      const total = items.reduce((product, item) => product * item.options.length, 1);
      if (total <= EXHAUSTIVE_LIMIT) {
        for (const choice of everyCombination(items)) {
          const mismatch = runScoreCase(port, definition, reference, choice, choice.join(','));
          if (mismatch) mismatches.push(mismatch);
        }
        expect(mismatches.slice(0, 5)).toEqual([]);
        return;
      }

      // Escore grande: combinações demais para varrer. A faixa só depende da
      // soma, então toda soma alcançável é conferida contra o ANY, além dos
      // extremos (tudo no mínimo e tudo no máximo) pela conta completa.
      const { interpretation } = definition;
      if (isRuleInterpretation(interpretation)) {
        throw new Error(`${id}: escore grande com faixa por regra precisa de bordas próprias`);
      }
      for (const sum of reachableSums(items)) {
        const anyInterpretation: AnyInterpretation = reference.interpret(sum, {});
        const band = findBand(interpretation, sum);
        const expected = {
          band: normalizeBandName(
            port.anyBandName
              ? port.anyBandName(anyInterpretation, sum, {})
              : anyInterpretation.label,
          ),
          tone: ANY_COLOR_TONE[anyInterpretation.color],
        };
        const received = { band: normalizeBandName(band.label), tone: band.tone };
        if (expected.band !== received.band || expected.tone !== received.tone) {
          mismatches.push({ case: `soma ${sum}`, expected, received });
        }
      }
      const lowest = items.map(() => 0);
      const highest = items.map((item) => item.options.length - 1);
      for (const choice of [lowest, highest]) {
        const mismatch = runScoreCase(port, definition, reference, choice, choice.join(','));
        if (mismatch) mismatches.push(mismatch);
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

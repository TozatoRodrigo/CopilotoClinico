import { describe, expect, it } from 'vitest';
import { allBands, isRuleInterpretation, type CalculatorDefinition } from './calculator';
import { CALCULATOR_CATALOG } from './calculator-catalog';
import { TOOLS } from './catalog';
import { CALCULATORS, getCalculator } from './registry';
import { RESULT_TONES } from './tone';

function texts(calculator: CalculatorDefinition): string[] {
  return allBands(calculator.interpretation).map(({ action }) => action);
}

/**
 * Regra de linguagem do ADR-017: a ferramenta sugere, não manda. Frase que
 * começa por verbo de ordem ou que pede "imediatamente" volta para revisão.
 */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;

describe.each(CALCULATORS.map((calculator) => [calculator.id, calculator] as const))(
  'definição %s',
  (_id, calculator) => {
    it('está no catálogo do ANY e é encontrada pelo id', () => {
      expect(CALCULATOR_CATALOG.some(({ id }) => id === calculator.id)).toBe(true);
      expect(getCalculator(calculator.id)).toBe(calculator);
    });

    it('tem faixas em ordem crescente, com tom válido e ação', () => {
      const { interpretation } = calculator;
      if (!isRuleInterpretation(interpretation)) {
        const { bands } = interpretation;
        for (let index = 1; index < bands.length; index += 1) {
          const previous = bands[index - 1];
          const current = bands[index];
          expect(current && previous && current.upTo.value >= previous.upTo.value).toBe(true);
        }
      }
      const bands = allBands(interpretation);
      for (const band of bands) {
        expect(RESULT_TONES).toContain(band.tone);
        expect(band.label.trim()).not.toBe('');
        expect(band.action.trim()).not.toBe('');
      }
      const ids = bands.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('aponta para um roteiro que existe no catálogo, quando tem roteiro', () => {
      if (!calculator.pathway) return;
      expect(TOOLS.map(({ id }) => id)).toContain(calculator.pathway.toolId);
    });

    it('não repete id de item nem de opção', () => {
      const items = calculator.items ?? [];
      expect(new Set(items.map(({ id }) => id)).size).toBe(items.length);
      for (const item of items) {
        expect(new Set(item.options.map(({ id }) => id)).size).toBe(item.options.length);
      }
      if (calculator.kind === 'formula') {
        const inputs = calculator.inputs.map(({ id }) => id);
        expect(new Set(inputs).size).toBe(inputs.length);
        for (const input of calculator.inputs) {
          expect(input.min).toBeLessThan(input.max);
          if (input.defaultValue !== undefined) {
            expect(input.defaultValue).toBeGreaterThanOrEqual(input.min);
            expect(input.defaultValue).toBeLessThanOrEqual(input.max);
          }
          if (input.optional) expect(input.defaultValue).toBeDefined();
        }
      }
    });

    it('traz procedência, revisão e referência', () => {
      expect(calculator.provenance.source).not.toBe('');
      expect(calculator.provenance.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(calculator.provenance.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(calculator.reference.citation).not.toBe('');
      expect(calculator.reference.pearlsPitfalls.length).toBeGreaterThan(0);
    });

    it('sugere em vez de mandar', () => {
      for (const action of [...texts(calculator), calculator.versionNotice?.text ?? '']) {
        expect(action, action).not.toMatch(IMPERATIVE_START);
        expect(action, action).not.toMatch(/imediatamente/i);
      }
    });
  },
);

describe('registro', () => {
  it('não repete id', () => {
    const ids = CALCULATORS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('devolve undefined para id fora do catálogo', () => {
    expect(getCalculator('nao-existe')).toBeUndefined();
  });

  it('tem as 75 calculadoras do catálogo do ANY no ar (CC-309)', () => {
    expect(CALCULATORS).toHaveLength(75);
    const missing = CALCULATOR_CATALOG.filter(({ id }) => !getCalculator(id)).map(({ id }) => id);
    expect(missing).toEqual([]);
  });
});

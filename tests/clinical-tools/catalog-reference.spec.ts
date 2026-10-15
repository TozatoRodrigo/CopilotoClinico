import { describe, expect, it } from 'vitest';
import {
  CALCULATOR_CATEGORIES as ANY_CATEGORIES,
  type Calculator as AnyCalculator,
} from '../any-reference/calculatorData';
import { CALCULATOR_CATALOG } from '../../src/shared/clinical-tools/calculator-catalog';
import {
  CALCULATOR_CATEGORIES,
  normalizeSearchText,
} from '../../src/shared/clinical-tools/catalog';

/**
 * O catálogo de calculadoras do hub é a lista do ANY (nome, categoria e
 * sinônimos). Se a referência mudar ou alguém editar o catálogo à mão, este
 * teste aponta a diferença. Categorias são comparadas sem acento: o catálogo
 * corrigiu "Obstetricia" e "Via Aerea".
 */
describe('catálogo de calculadoras × referência do ANY', () => {
  const reference = ANY_CATEGORIES.flatMap(
    (category: { name: string; calculators: AnyCalculator[] }) =>
      category.calculators.map((calculator) => ({ category: category.name, calculator })),
  );

  it('tem as 75 calculadoras em 16 categorias, na mesma ordem', () => {
    expect(CALCULATOR_CATALOG).toHaveLength(75);
    expect(reference).toHaveLength(75);
    expect(CALCULATOR_CATEGORIES.map(normalizeSearchText)).toEqual(
      ANY_CATEGORIES.map(({ name }: { name: string }) => normalizeSearchText(name)),
    );
    expect(CALCULATOR_CATALOG.map(({ anyId }) => anyId)).toEqual(
      reference.map(({ calculator }) => calculator.id),
    );
  });

  it('copia nome, sinônimos e categoria de cada uma', () => {
    CALCULATOR_CATALOG.forEach((entry, index) => {
      const source = reference[index];
      expect(entry.name).toBe(source?.calculator.name);
      expect(entry.aliases).toEqual(source?.calculator.aliases);
      expect(normalizeSearchText(entry.category)).toBe(normalizeSearchText(source?.category ?? ''));
    });
  });

  it('usa ids sem acento e sem repetição, prontos para URL', () => {
    const ids = CALCULATOR_CATALOG.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

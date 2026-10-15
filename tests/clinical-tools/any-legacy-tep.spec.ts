import { describe, expect, it } from 'vitest';
import { classifyWells } from '../any-reference/calculations';
import { evaluateCalculator } from '../../src/shared/clinical-tools/calculator';
import { wellsLevelFor } from '../../src/shared/clinical-tools/tep/pathway';
import { WELLS_TEP } from '../../src/shared/clinical-tools/tep/wells';

/**
 * CC-318 — testes do branch antigo do ANY (claude/update-test-database-M10pD,
 * revisão 649d2ae) que cobrem o TEP, com os nomes novos. O `classifyWells`
 * de lá virou as faixas do `WELLS_TEP` e o `wellsLevelFor` do roteiro; os
 * níveis mudaram de nome (low → baixa, moderate → intermediaria, high → alta).
 */

const LEVEL = { low: 'baixa', moderate: 'intermediaria', high: 'alta' } as const;

/** Respostas do Wells que somam exatamente a pontuação pedida (a primeira combinação que serve). */
function wellsAnswers(score: number): Record<string, string> {
  const items = WELLS_TEP.items;
  for (let mask = 0; mask < 2 ** items.length; mask += 1) {
    const chosen = items.map((_, index) => Boolean(mask & (1 << index)));
    const sum = items.reduce(
      (total, item, index) => total + (chosen[index] ? (item.options[1]?.points ?? 0) : 0),
      0,
    );
    if (sum === score) {
      return Object.fromEntries(
        items.map((item, index) => [item.id, chosen[index] ? 'sim' : 'nao']),
      );
    }
  }
  throw new Error(`soma ${score} inalcançável no Wells`);
}

function band(score: number): string {
  const evaluation = evaluateCalculator(WELLS_TEP, { items: wellsAnswers(score) });
  if (evaluation.status !== 'complete') throw new Error('Wells incompleto');
  expect(evaluation.value).toBe(score);
  return evaluation.band.id;
}

// Origem: v2/src/utils/calculations.test.ts › classifyWells
describe('classifyWells → Wells para TEP (calculations.test.ts)', () => {
  it('classifica baixa probabilidade (< 2)', () => {
    expect(wellsLevelFor(1)).toBe('baixa');
    expect(band(1)).toBe('baixa');
  });

  it('classifica probabilidade intermediaria (2-6)', () => {
    expect(wellsLevelFor(4)).toBe('intermediaria');
    expect(band(4)).toBe('intermediaria');
  });

  it('classifica alta probabilidade (> 6)', () => {
    expect(wellsLevelFor(7)).toBe('alta');
    expect(band(7)).toBe('alta');
  });

  it('limite 2 e intermediaria', () => {
    expect(wellsLevelFor(2)).toBe('intermediaria');
    expect(band(2)).toBe('intermediaria');
  });

  it('limite 6 e intermediaria', () => {
    expect(wellsLevelFor(6)).toBe('intermediaria');
    expect(band(6)).toBe('intermediaria');
  });

  it('e o classifyWells congelado concorda em toda soma alcançável', () => {
    for (let score = 0; score <= 12.5; score += 0.5) {
      expect(wellsLevelFor(score), String(score)).toBe(LEVEL[classifyWells(score).risk]);
    }
  });
});

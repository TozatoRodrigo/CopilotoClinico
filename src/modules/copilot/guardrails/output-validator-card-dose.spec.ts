import { describe, expect, it } from 'vitest';
import { validateOutputV2 } from './output-validator-v2';
import { validateOutputV3 } from './output-validator-v3';
import { reviewedCard } from '../../../../tests/fixtures/reviewed-cards';

/**
 * CC-408 — a conduta que cita um cartão revisado só traz a dose estruturada
 * do cartão. Dose fora dele é corrigível: um retry com feedback, e depois o
 * orquestrador tira a citação.
 */

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    action: 'Ceftriaxona 2 g IV a cada 12 horas, logo após a coleta do líquor',
    rationale: 'Antibiótico empírico da meningite bacteriana no adulto',
    category: 'therapeutic',
    layer: 'now',
    dependsOn: null,
    basis: 'source',
    citationChunkId: 'card:1',
    confidence: 0.9,
    ...overrides,
  };
}

function output(recommendations: unknown[]) {
  return JSON.stringify({
    reasoning: 'Febre, cefaleia e rigidez de nuca: meningite bacteriana até prova em contrário.',
    redFlags: [],
    recommendations,
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
  });
}

const cards = new Map([['card:1', reviewedCard()]]);

describe.each([
  ['v2', validateOutputV2],
  ['v3', validateOutputV3],
])('dose do cartão no validador %s', (_version, validate) => {
  it('aceita a dose do cartão citado', () => {
    const result = validate(output([recommendation()]), ['card:1'], {
      understanding: null,
      reviewedCards: cards,
    });

    expect(result.valid).toBe(true);
    expect(result.correctable).toEqual([]);
  });

  it('pede correção da dose que o cartão não dá, dizendo qual e de que cartão', () => {
    const result = validate(
      output([recommendation(), recommendation({ action: 'Ceftriaxona 1 g IV a cada 12 horas' })]),
      ['card:1'],
      { understanding: null, reviewedCards: cards },
    );

    expect(result.valid).toBe(true);
    expect(result.correctable).toEqual([
      expect.stringMatching(
        /^CARD DOSE NOT IN CARD: recommendations index 1 \("1 g" citing card:1\)/,
      ),
    ]);
  });

  it('sem cartões no contexto (flag desligada), a regra não roda', () => {
    const result = validate(
      output([recommendation({ action: 'Ceftriaxona 1 g IV' })]),
      ['card:1'],
      { understanding: null },
    );

    expect(result.correctable).toEqual([]);
  });

  it('não confere dose de conduta que cita outra fonte', () => {
    const result = validate(
      output([recommendation({ action: 'Ceftriaxona 1 g IV', citationChunkId: 'web:1' })]),
      ['card:1', 'web:1'],
      { understanding: null, reviewedCards: cards },
    );

    expect(result.correctable).toEqual([]);
  });
});

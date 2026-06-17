import { describe, it, expect } from 'vitest';
import { messages, hasForbiddenTerm, FORBIDDEN_AI_PATTERNS } from '../index';

/** Recursively collect every string leaf in a nested object (ignores functions). */
function collectStrings(node: unknown, path = '', acc: { path: string; value: string }[] = []) {
  if (typeof node === 'string') {
    acc.push({ path, value: node });
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, child] of Object.entries(node)) {
      collectStrings(child, path ? `${path}.${key}` : key, acc);
    }
  }
  return acc;
}

describe('messages registry', () => {
  it('exposes the expected clinical domains', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const top = Object.keys(messages) as string[];
    for (const domain of ['copilot', 'recommendation', 'redFlags', 'uncertainty', 'capture', 'errors']) {
      expect(top, `missing domain ${domain}`).toContain(domain);
    }
  });

  it('pluralizes recommendation count correctly', () => {
    expect(messages.copilot.result.recommendationsCount(1)).toBe('1 recomendação');
    expect(messages.copilot.result.recommendationsCount(3)).toBe('3 recomendações');
  });

  it('pluralizes turn summary correctly', () => {
    expect(messages.copilot.turns.previousSummary(1, 1)).toBe('Turno 1 · 1 pergunta respondida');
    expect(messages.copilot.turns.previousSummary(2, 3)).toBe('Turno 2 · 3 perguntas respondidas');
  });
});

describe('clinical tone guard (anti-slop)', () => {
  const offenders = [
    'diagnosticar',
    'diagnostica',
    'garante',
    'garantir',
    'assegura',
    'comprovadamente',
    'curar',
    'cura',
    'tem 100% de certeza',
  ];

  it('flags known forbidden AI-decision terms', () => {
    for (const bad of offenders) {
      expect(hasForbiddenTerm(bad), `should flag "${bad}"`).toBe(true);
    }
  });

  it('does not flag allowed clinical nouns (no false positives)', () => {
    const allowed = ['Diagnóstico', 'curativo', 'recomenda-se revisão', 'Conduta', 'Sinais de alarme'];
    for (const good of allowed) {
      expect(hasForbiddenTerm(good), `should allow "${good}"`).toBe(false);
    }
  });

  it('contains no forbidden AI-decision language anywhere in the dictionary', () => {
    const leaves = collectStrings(messages);
    const violations = leaves.filter((leaf) => hasForbiddenTerm(leaf.value));
    expect(
      violations,
      `forbidden terms found at: ${violations.map((v) => v.path).join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the forbidden pattern list non-empty', () => {
    expect(FORBIDDEN_AI_PATTERNS.length).toBeGreaterThan(0);
  });
});

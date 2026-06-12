import { describe, expect, it } from 'vitest';
import { KB_001_SYNTHETIC_CASES } from './fixtures/kb-001-synthetic-cases';

describe('KB-001 synthetic evaluation pack', () => {
  it('contains 40 synthetic cases, with 2 cases per scenario', () => {
    expect(KB_001_SYNTHETIC_CASES).toHaveLength(40);

    const counts = new Map<string, number>();
    for (const testCase of KB_001_SYNTHETIC_CASES) {
      counts.set(testCase.cenario, (counts.get(testCase.cenario) ?? 0) + 1);
      expect(testCase.expectedFocus.length).toBeGreaterThanOrEqual(2);
    }

    expect(counts.size).toBe(20);
    for (const count of counts.values()) {
      expect(count).toBe(2);
    }
  });

  it('includes the canonical gripe >48h case for the multi-turn decision flow', () => {
    const canonical = KB_001_SYNTHETIC_CASES.find((testCase) => testCase.id === 'sg-001');

    expect(canonical).toBeDefined();
    expect(canonical?.cenario).toBe('sindrome_gripal_ivas');
    expect(canonical?.clinicalInput.toLowerCase()).toContain('3 dias');
    expect(canonical?.expectedDecision).toBe('clarify');
    expect(canonical?.expectedFocus).toContain('imunossupressão');
  });
});

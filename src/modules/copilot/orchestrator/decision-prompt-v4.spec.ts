import { describe, expect, it } from 'vitest';
import {
  DECISION_V3_EXAMPLE,
  DECISION_V3_INSTRUCTIONS,
  DECISION_V3_OUTPUT_SCHEMA,
  DECISION_V3_SYSTEM_PROMPT,
} from './decision-prompt-v3';
import { buildDecisionV4Prompt, DECISION_V4_SYSTEM_PROMPT } from './decision-prompt-v4';

const V4_INSTRUCTIONS = DECISION_V4_SYSTEM_PROMPT.split(`\n\n${DECISION_V3_OUTPUT_SCHEMA}`)[0] ?? '';

describe('DECISION_V4_SYSTEM_PROMPT', () => {
  it('keeps the v3 output schema and worked example', () => {
    expect(
      DECISION_V4_SYSTEM_PROMPT.endsWith(`${DECISION_V3_OUTPUT_SCHEMA}\n\n${DECISION_V3_EXAMPLE}`),
    ).toBe(true);
  });

  it('treats ventilatory support already indicated by clinical signs as time-critical', () => {
    expect(V4_INSTRUCTIONS).toContain(
      'ventilatory support (NIV or intubation) when the clinical signs of respiratory failure are already present',
    );
  });

  it('keeps a minutes-long bedside safety check inside the "now" action', () => {
    expect(V4_INSTRUCTIONS).toContain('is not a reason for "depends": keep the action in "now"');
  });

  it('withholds a risky action when no available test can exclude the harmful hypothesis', () => {
    expect(V4_INSTRUCTIONS).toContain('a normal CT does not exclude subarachnoid hemorrhage');
  });

  it('never discharges before the deciding data and sends to the missing resource now', () => {
    expect(V4_INSTRUCTIONS).toContain('the destination is observation in the emergency department');
    expect(V4_INSTRUCTIONS).toContain('— never discharge');
    expect(V4_INSTRUCTIONS).toContain('Transfer or referral to a resource this facility lacks');
  });

  it('changes only rules 2, 3 and 4 of v3', () => {
    const rules = (text: string) => text.split(/\n(?=\d\. )/);
    const v3 = rules(DECISION_V3_INSTRUCTIONS);
    const v4 = rules(V4_INSTRUCTIONS);
    expect(v4).toHaveLength(v3.length);
    v3.forEach((rule, index) => {
      const changed = v4[index] !== rule;
      expect(changed, `regra ${rule.slice(0, 3)}`).toBe(/^[234]\. /.test(rule));
    });
  });

  it('leaves the v3 system prompt untouched', () => {
    expect(DECISION_V3_SYSTEM_PROMPT.startsWith(DECISION_V3_INSTRUCTIONS)).toBe(true);
    expect(DECISION_V3_INSTRUCTIONS).not.toContain('never discharge');
  });
});

describe('buildDecisionV4Prompt', () => {
  it('uses the v4 system prompt as is in pt-BR, so it stays cacheable', () => {
    const prompt = buildDecisionV4Prompt({
      caseText: 'Homem, 70 anos, hemiparesia direita súbita.',
      context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
      retrievedChunks: [],
      officialChunks: [],
      physicianAttachments: [],
      webEvidence: [],
    });
    expect(prompt.system).toBe(DECISION_V4_SYSTEM_PROMPT);
  });
});

import { describe, expect, it } from 'vitest';
import { RECOMMENDATION_WHY_MAX_LENGTH } from '../../../shared/contracts/clinical';
import { validateOutputV3 } from '../guardrails/output-validator-v3';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import type { DecisionV2PromptInput } from './decision-prompt-v2';
import {
  buildDecisionV3Prompt,
  DECISION_V3_EXAMPLE,
  DECISION_V3_INSTRUCTIONS,
  DECISION_V3_OUTPUT_SCHEMA,
  DECISION_V3_SYSTEM_PROMPT,
} from './decision-prompt-v3';
import { DECISION_V4_INSTRUCTIONS, DECISION_V4_SYSTEM_PROMPT } from './decision-prompt-v4';
import {
  buildDecisionWhyLinePrompt,
  DECISION_V3_WHY_EXAMPLE,
  DECISION_V3_WHY_OUTPUT_SCHEMA,
  DECISION_V3_WHY_SYSTEM_PROMPT,
  DECISION_V4_WHY_SYSTEM_PROMPT,
  WHY_FIELD,
  WHY_LINE_RULE,
} from './decision-why-line';

function input(overrides: Partial<DecisionV2PromptInput> = {}): DecisionV2PromptInput {
  return {
    caseText: 'Homem, 68 anos, hemiparesia direita e afasia há 1h30. PA 182x104.',
    understanding: understandingFixture(),
    context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
    retrievedChunks: [],
    officialChunks: [],
    physicianAttachments: [],
    webEvidence: [],
    ...overrides,
  };
}

function exampleOutput(): string {
  return DECISION_V3_WHY_EXAMPLE.split('Expected output:\n')[1] ?? '';
}

describe('decisão com a linha de "por quê" (CC-601)', () => {
  it('keeps the approved v3 instructions literal and adds the rule after them', () => {
    expect(DECISION_V3_WHY_SYSTEM_PROMPT).toBe(
      `${DECISION_V3_INSTRUCTIONS}\n\n${WHY_LINE_RULE}\n\n${DECISION_V3_WHY_OUTPUT_SCHEMA}\n\n${DECISION_V3_WHY_EXAMPLE}`,
    );
  });

  it('builds the v4 variant from the v4 instructions, with the same rule, format and example', () => {
    expect(DECISION_V4_WHY_SYSTEM_PROMPT).toBe(
      DECISION_V3_WHY_SYSTEM_PROMPT.replace(DECISION_V3_INSTRUCTIONS, DECISION_V4_INSTRUCTIONS),
    );
  });

  it.each([
    'Every "now" recommendation also carries "why": one plain sentence of at most 120 characters',
    'general practitioners without emergency residency',
    'explain it in a few words (e.g. "escala NIHSS de gravidade")',
    'No dose, no source names, no probability language.',
    '"rationale" stays as before.',
    '"why" is null in "depends"',
  ])('asks for "%s"', (sentence) => {
    expect(WHY_LINE_RULE).toContain(sentence);
  });

  it('says the limit the validator checks', () => {
    expect(WHY_LINE_RULE).toContain(`at most ${RECOMMENDATION_WHY_MAX_LENGTH} characters`);
    expect(WHY_FIELD).toContain(`at most ${RECOMMENDATION_WHY_MAX_LENGTH} characters`);
  });

  it('adds only the "why" field to the v3 output format, right after "dependsOn"', () => {
    expect(DECISION_V3_WHY_OUTPUT_SCHEMA).toContain(`null when layer is now",\n${WHY_FIELD}`);
    expect(DECISION_V3_WHY_OUTPUT_SCHEMA.replace(WHY_FIELD, '')).toBe(DECISION_V3_OUTPUT_SCHEMA);
  });

  it('is the v3 example byte for byte once the "why" fields are taken out', () => {
    const withoutWhy = DECISION_V3_WHY_EXAMPLE.replace(/"why": (?:"[^"]*"|null), (?="basis")/g, '');
    expect(withoutWhy).toBe(DECISION_V3_EXAMPLE);
  });

  it('carries an example that the v3 validator with the line accepts without findings', () => {
    const result = validateOutputV3(exampleOutput(), ['web:1'], {
      understanding: understandingFixture(),
      whyLine: true,
    });

    expect(result).toMatchObject({ valid: true, errors: [], correctable: [], warnings: [] });
    const recommendations = result.output?.recommendations ?? [];
    const now = recommendations.filter((rec) => rec.layer === 'now');
    expect(now).toHaveLength(4);
    for (const rec of now) {
      expect(rec.why?.length).toBeLessThanOrEqual(RECOMMENDATION_WHY_MAX_LENGTH);
    }
    expect(recommendations.find((rec) => rec.layer === 'depends')?.why).toBeUndefined();
  });

  it('leaves the v3 and v4 system prompts without the line', () => {
    for (const prompt of [DECISION_V3_SYSTEM_PROMPT, DECISION_V4_SYSTEM_PROMPT]) {
      expect(prompt).not.toContain('WHY LINE');
      expect(prompt).not.toContain(WHY_FIELD);
    }
  });
});

describe('buildDecisionWhyLinePrompt', () => {
  it.each([
    ['v3', DECISION_V3_WHY_SYSTEM_PROMPT],
    ['v4', DECISION_V4_WHY_SYSTEM_PROMPT],
  ] as const)('uses the %s system prompt with the line as is in pt-BR', (version, system) => {
    expect(buildDecisionWhyLinePrompt(version, input()).system).toBe(system);
  });

  it('sends the same user message and citable ids as v3', () => {
    const promptInput = input({ redFlags: { anticoagulant: true }, additionalInstructions: 'x' });
    const withLine = buildDecisionWhyLinePrompt('v3', promptInput);
    const v3 = buildDecisionV3Prompt(promptInput);

    expect(withLine.user).toBe(v3.user);
    expect(withLine.retrievedChunkIds).toEqual(v3.retrievedChunkIds);
  });

  it('answers in Spanish with the same language rule as v3', () => {
    const withLine = buildDecisionWhyLinePrompt('v3', input({ locale: 'es' })).system;
    const v3 = buildDecisionV3Prompt(input({ locale: 'es' })).system;

    expect(withLine.slice(DECISION_V3_WHY_SYSTEM_PROMPT.length)).toBe(
      v3.slice(DECISION_V3_SYSTEM_PROMPT.length),
    );
  });
});

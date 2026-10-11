import { describe, expect, it } from 'vitest';
import { CopilotOutputSchema } from '../guardrails/output-validator';
import { COPILOT_OUTPUT_JSON_SCHEMA } from './copilot-output.json-schema';
import {
  collectObjects,
  jsonShape,
  UNSUPPORTED_KEYWORDS,
  zodShape,
} from '../../../../tests/helpers/json-schema-parity';

describe('COPILOT_OUTPUT_JSON_SCHEMA', () => {
  it('mirrors the zod schema field names, types, enums and nullability', () => {
    expect(jsonShape(COPILOT_OUTPUT_JSON_SCHEMA.schema)).toEqual(zodShape(CopilotOutputSchema));
  });

  it('closes every object and lists every property as required (OpenAI strict mode)', () => {
    const objects = collectObjects(COPILOT_OUTPUT_JSON_SCHEMA.schema);

    expect(objects.length).toBeGreaterThan(1);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties));
    }
  });

  it('uses only keywords supported by both providers', () => {
    const serialized = JSON.stringify(COPILOT_OUTPUT_JSON_SCHEMA.schema);

    for (const keyword of UNSUPPORTED_KEYWORDS) {
      expect(serialized).not.toContain(`"${keyword}"`);
    }
  });
});

describe('CopilotOutputSchema with structured-output nulls', () => {
  const baseOutput = {
    reasoning: 'Raciocínio',
    redFlags: [],
    recommendations: [],
    uncertainty: true,
    uncertaintyReason: 'Falta um dado',
  };
  const question = {
    id: 'q1',
    question: 'Há febre?',
    why: 'Muda a conduta',
    criticality: 'blocker',
    expectedAnswerType: 'boolean',
  };
  const differential = {
    hypothesis: 'Hipótese',
    whyConsider: 'Motivo',
    whatDistinguishes: 'Exame',
    cannotMiss: false,
  };

  it('parses null optional fields exactly like absent ones', () => {
    const withNulls = CopilotOutputSchema.parse({
      ...baseOutput,
      clarifyingQuestions: [{ ...question, choices: null, purpose: null }],
      differentials: [{ ...differential, timeToHarm: null }],
    });
    const withoutKeys = CopilotOutputSchema.parse({
      ...baseOutput,
      clarifyingQuestions: [question],
      differentials: [differential],
    });

    expect(withNulls).toEqual(withoutKeys);
    expect(withNulls.clarifyingQuestions[0]?.choices).toBeUndefined();
    expect(withNulls.differentials[0]?.timeToHarm).toBeUndefined();
  });

  it('keeps provided optional values', () => {
    const parsed = CopilotOutputSchema.parse({
      ...baseOutput,
      clarifyingQuestions: [{ ...question, choices: ['Sim', 'Não'], purpose: 'Infecção' }],
      differentials: [{ ...differential, cannotMiss: true, timeToHarm: 'horas' }],
    });

    expect(parsed.clarifyingQuestions[0]).toMatchObject({
      choices: ['Sim', 'Não'],
      purpose: 'Infecção',
    });
    expect(parsed.differentials[0]?.timeToHarm).toBe('horas');
  });
});

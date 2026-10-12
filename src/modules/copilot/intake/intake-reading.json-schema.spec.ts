import { describe, expect, it } from 'vitest';
import {
  collectObjects,
  jsonShape,
  UNSUPPORTED_KEYWORDS,
  zodShape,
} from '../../../../tests/helpers/json-schema-parity';
import { intakeReadingFixture } from '../../../../tests/fixtures/intake-reading';
import { INTAKE_READING_JSON_SCHEMA } from './intake-reading.json-schema';
import { IntakeReadingSchema, understandingOf, validateIntakeReading } from './intake-reading.schema';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import { INTAKE_READING_SYSTEM_PROMPT } from './intake-reading-prompt';
import { UNDERSTANDING_SYSTEM_PROMPT } from '../understanding/understanding-prompt';

describe('INTAKE_READING_JSON_SCHEMA', () => {
  it('mirrors the zod schema field names, types, enums and nullability', () => {
    expect(jsonShape(INTAKE_READING_JSON_SCHEMA.schema)).toEqual(zodShape(IntakeReadingSchema));
  });

  it('closes every object and lists every property as required', () => {
    for (const object of collectObjects(INTAKE_READING_JSON_SCHEMA.schema)) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties));
    }
  });

  it('uses only keywords supported by both providers', () => {
    const serialized = JSON.stringify(INTAKE_READING_JSON_SCHEMA.schema);

    for (const keyword of UNSUPPORTED_KEYWORDS) {
      expect(serialized).not.toContain(`"${keyword}"`);
    }
  });

  it('generates the case understanding before the questions', () => {
    const fields = Object.keys(INTAKE_READING_JSON_SCHEMA.schema.properties);

    expect(fields.indexOf('missingDiscriminators')).toBeLessThan(fields.indexOf('intakeQuestions'));
  });
});

describe('INTAKE_READING_SYSTEM_PROMPT', () => {
  it('keeps the understanding rules approved by the gold set word for word', () => {
    expect(INTAKE_READING_SYSTEM_PROMPT.startsWith(UNDERSTANDING_SYSTEM_PROMPT)).toBe(true);
  });
});

describe('validateIntakeReading', () => {
  it('accepts a complete reading', () => {
    const reading = intakeReadingFixture();

    expect(validateIntakeReading(JSON.stringify(reading))).toEqual({ valid: true, value: reading });
  });

  it('applies the understanding rules', () => {
    const result = validateIntakeReading(
      JSON.stringify(intakeReadingFixture({ instability: { present: true, findings: [] } })),
    );

    expect(result.valid).toBe(false);
  });

  it('rejects more than 3 questions', () => {
    const reading = intakeReadingFixture();
    const result = validateIntakeReading(
      JSON.stringify({ ...reading, intakeQuestions: Array(4).fill(reading.intakeQuestions[0]) }),
    );

    expect(result).toEqual({
      valid: false,
      errors: ['intakeQuestions: intakeQuestions must contain at most 3 questions'],
    });
  });
});

describe('understandingOf', () => {
  it('returns the stage 1 understanding inside the reading', () => {
    expect(understandingOf(intakeReadingFixture())).toEqual(understandingFixture());
  });
});

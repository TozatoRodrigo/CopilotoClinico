import { describe, expect, it } from 'vitest';
import {
  collectObjects,
  jsonShape,
  UNSUPPORTED_KEYWORDS,
  zodShape,
} from '../../../../tests/helpers/json-schema-parity';
import { intakeReadingFixture, intakeReadingWire } from '../../../../tests/fixtures/intake-reading';
import { INTAKE_READING_JSON_SCHEMA } from './intake-reading.json-schema';
import {
  IntakeReadingSchema,
  understandingOf,
  validateIntakeReading,
} from './intake-reading.schema';
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

  // Cada anulável é uma união na gramática do structured output. Com os sete
  // sinais vitais anuláveis da Etapa 1, a leitura passava do limite da
  // Anthropic ("compiled grammar is too large", 12/10/2026) e falhava sempre;
  // com 5 uniões ela compila. Não há como compilar a gramática no teste: este
  // teto barra a volta do formato que falhou.
  it('keeps the nullable unions within what the Anthropic grammar compiled', () => {
    const unions = JSON.stringify(INTAKE_READING_JSON_SCHEMA.schema).match(/"anyOf"/g) ?? [];

    expect(unions.length).toBeLessThanOrEqual(5);
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

    expect(validateIntakeReading(JSON.stringify(intakeReadingWire(reading)))).toEqual({
      valid: true,
      value: reading,
    });
  });

  it('turns the listed vital signs into the understanding vitals, null when not given', () => {
    const wire = intakeReadingWire();
    const result = validateIntakeReading(
      JSON.stringify({
        ...wire,
        structuredData: {
          ...wire.structuredData,
          vitals: [
            { sign: 'spo2', value: 88 },
            { sign: 'systolicBp', value: 82 },
          ],
        },
      }),
    );

    expect(result.valid && result.value.structuredData.vitals).toEqual({
      systolicBp: 82,
      diastolicBp: null,
      heartRate: null,
      respiratoryRate: null,
      spo2: 88,
      temperature: null,
      glucose: null,
    });
  });

  it('rejects a vital sign listed twice', () => {
    const wire = intakeReadingWire();
    const result = validateIntakeReading(
      JSON.stringify({
        ...wire,
        structuredData: {
          ...wire.structuredData,
          vitals: [
            { sign: 'heartRate', value: 120 },
            { sign: 'heartRate', value: 98 },
          ],
        },
      }),
    );

    expect(result).toEqual({
      valid: false,
      errors: ['structuredData.vitals: list each vital sign at most once'],
    });
  });

  it('applies the understanding rules', () => {
    const result = validateIntakeReading(
      JSON.stringify(
        intakeReadingWire(intakeReadingFixture({ instability: { present: true, findings: [] } })),
      ),
    );

    expect(result.valid).toBe(false);
  });

  it('rejects more than 3 questions', () => {
    const wire = intakeReadingWire();
    const result = validateIntakeReading(
      JSON.stringify({ ...wire, intakeQuestions: Array(4).fill(wire.intakeQuestions[0]) }),
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

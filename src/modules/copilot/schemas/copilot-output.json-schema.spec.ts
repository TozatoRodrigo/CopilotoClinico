import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CopilotOutputSchema } from '../guardrails/output-validator';
import {
  COPILOT_OUTPUT_JSON_SCHEMA,
  type JsonObjectSchema,
  type JsonSchemaNode,
} from './copilot-output.json-schema';

/** Forma comparável entre zod e JSON Schema: tipos, campos, enums e anulabilidade. */
type Shape =
  | { kind: 'string' | 'number' | 'boolean' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'array'; items: Shape }
  | { kind: 'object'; fields: Record<string, { shape: Shape; nullable: boolean }> };

interface Unwrapped {
  schema: z.ZodTypeAny;
  mayBeAbsent: boolean;
  hasDefault: boolean;
}

function unwrapZod(schema: z.ZodTypeAny): Unwrapped {
  if (schema instanceof z.ZodEffects) return unwrapZod(schema.innerType());
  if (schema instanceof z.ZodDefault)
    return { ...unwrapZod(schema.removeDefault()), hasDefault: true };
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return { ...unwrapZod(schema.unwrap()), mayBeAbsent: true };
  }
  return { schema, mayBeAbsent: false, hasDefault: false };
}

function zodShape(input: z.ZodTypeAny): Shape {
  const { schema } = unwrapZod(input);
  if (schema instanceof z.ZodString) return { kind: 'string' };
  if (schema instanceof z.ZodNumber) return { kind: 'number' };
  if (schema instanceof z.ZodBoolean) return { kind: 'boolean' };
  if (schema instanceof z.ZodEnum) return { kind: 'enum', values: [...schema.options] };
  if (schema instanceof z.ZodArray) return { kind: 'array', items: zodShape(schema.element) };
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const fields = Object.fromEntries(
      Object.entries(shape).map(([name, field]) => {
        const { mayBeAbsent, hasDefault } = unwrapZod(field);
        // Campo com default é sempre enviado pelo modelo; só o opcional sem
        // default precisa aceitar `null` no JSON Schema.
        return [name, { shape: zodShape(field), nullable: mayBeAbsent && !hasDefault }];
      }),
    );
    return { kind: 'object', fields };
  }
  throw new Error(`Unsupported zod type in parity test: ${schema.constructor.name}`);
}

function stripNull(node: JsonSchemaNode): { node: JsonSchemaNode; nullable: boolean } {
  if (!('anyOf' in node)) return { node, nullable: false };
  const nonNull = node.anyOf.filter((option) => !('type' in option && option.type === 'null'));
  const [single] = nonNull;
  if (nonNull.length !== 1 || !single) throw new Error('Only `T | null` unions are expected');
  return { node: single, nullable: true };
}

function jsonShape(input: JsonSchemaNode): Shape {
  const { node } = stripNull(input);
  if (!('type' in node)) throw new Error('Nested anyOf is not expected');
  if (node.type === 'string') {
    return node.enum ? { kind: 'enum', values: [...node.enum] } : { kind: 'string' };
  }
  if (node.type === 'number' || node.type === 'boolean') return { kind: node.type };
  if (node.type === 'array') return { kind: 'array', items: jsonShape(node.items) };
  if (node.type === 'object') {
    const fields = Object.fromEntries(
      Object.entries(node.properties).map(([name, field]) => [
        name,
        { shape: jsonShape(field), nullable: stripNull(field).nullable },
      ]),
    );
    return { kind: 'object', fields };
  }
  throw new Error(`Unsupported JSON Schema node: ${node.type}`);
}

function collectObjects(node: JsonSchemaNode): JsonObjectSchema[] {
  if ('anyOf' in node) return node.anyOf.flatMap(collectObjects);
  if (node.type === 'array') return collectObjects(node.items);
  if (node.type !== 'object') return [];
  return [node, ...Object.values(node.properties).flatMap(collectObjects)];
}

const UNSUPPORTED_KEYWORDS = [
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'default',
];

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

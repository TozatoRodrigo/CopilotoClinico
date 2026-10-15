import { z } from 'zod';
import type {
  JsonObjectSchema,
  JsonSchemaNode,
} from '../../src/modules/copilot/schemas/json-schema';

/**
 * Comparação entre um schema zod e o JSON Schema escrito à mão para
 * structured outputs (json-schema.ts). Usada pelos specs de paridade: o JSON
 * Schema diz ao modelo o formato, o zod valida a resposta — se divergirem, o
 * modelo é obrigado a gerar algo que o validador recusa.
 */

/** Forma comparável entre zod e JSON Schema: tipos, campos, enums e anulabilidade. */
export type Shape =
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

export function zodShape(input: z.ZodTypeAny): Shape {
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

export function jsonShape(input: JsonSchemaNode): Shape {
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

export function collectObjects(node: JsonSchemaNode): JsonObjectSchema[] {
  if ('anyOf' in node) return node.anyOf.flatMap(collectObjects);
  if (node.type === 'array') return collectObjects(node.items);
  if (node.type !== 'object') return [];
  return [node, ...Object.values(node.properties).flatMap(collectObjects)];
}

/** Palavras-chave que um dos dois providers recusa em structured outputs. */
export const UNSUPPORTED_KEYWORDS = [
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'default',
];

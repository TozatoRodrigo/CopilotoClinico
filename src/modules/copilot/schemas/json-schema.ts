/**
 * Blocos dos JSON Schemas de structured outputs, escritos à mão porque o zod 3
 * não gera JSON Schema.
 *
 * Subconjunto aceito pela Anthropic e pelo modo estrito da OpenAI: todo
 * objeto fecha com `additionalProperties: false` e lista todos os campos em
 * `required`; campo opcional no zod vira anulável aqui. Limites (tamanho,
 * mínimo, máximo) ficam no zod, que valida a resposta depois — ver
 * json-schema-parity.ts.
 */

export type JsonSchemaNode =
  | { type: 'string'; enum?: readonly string[] }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'null' }
  | { type: 'array'; items: JsonSchemaNode }
  | JsonObjectSchema
  | { anyOf: readonly JsonSchemaNode[] };

export type JsonObjectSchema = {
  type: 'object';
  properties: Record<string, JsonSchemaNode>;
  required: string[];
  additionalProperties: false;
};

export const STRING: JsonSchemaNode = { type: 'string' };
export const NUMBER: JsonSchemaNode = { type: 'number' };
export const BOOLEAN: JsonSchemaNode = { type: 'boolean' };

export function oneOf(values: readonly string[]): JsonSchemaNode {
  return { type: 'string', enum: values };
}

export function arrayOf(items: JsonSchemaNode): JsonSchemaNode {
  return { type: 'array', items };
}

export function nullable(node: JsonSchemaNode): JsonSchemaNode {
  return { anyOf: [node, { type: 'null' }] };
}

export function strictObject(properties: Record<string, JsonSchemaNode>): JsonObjectSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

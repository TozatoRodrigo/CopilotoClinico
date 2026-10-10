import type { JsonResponseSchema } from '../../ai-gateway/providers/provider.interface';

/**
 * JSON Schema do `CopilotOutputSchema` (guardrails/output-validator.ts) para
 * structured outputs. Só estrutura: limites numéricos e de tamanho
 * (confidence 0..1, máx. 3 diferenciais/perguntas, strings não vazias) e os
 * `.refine` de negócio continuam no zod, que valida a resposta depois.
 *
 * Subconjunto aceito pela Anthropic e pelo modo estrito da OpenAI: todo
 * objeto fecha com `additionalProperties: false` e lista todos os campos em
 * `required`; campo opcional no zod vira anulável aqui. Escrito à mão porque o
 * zod 3 não gera JSON Schema — copilot-output.json-schema.spec.ts garante a
 * paridade de campos, tipos e enums com o zod.
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

const STRING: JsonSchemaNode = { type: 'string' };
const NUMBER: JsonSchemaNode = { type: 'number' };
const BOOLEAN: JsonSchemaNode = { type: 'boolean' };

function oneOf(values: readonly string[]): JsonSchemaNode {
  return { type: 'string', enum: values };
}

function arrayOf(items: JsonSchemaNode): JsonSchemaNode {
  return { type: 'array', items };
}

function nullable(node: JsonSchemaNode): JsonSchemaNode {
  return { anyOf: [node, { type: 'null' }] };
}

function strictObject(properties: Record<string, JsonSchemaNode>): JsonObjectSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const RED_FLAG = strictObject({
  finding: STRING,
  severity: oneOf(['critical', 'high', 'moderate']),
  action: STRING,
});

const RECOMMENDATION = strictObject({
  action: STRING,
  rationale: STRING,
  citationChunkId: STRING,
  confidence: NUMBER,
  preliminary: BOOLEAN,
  category: oneOf(['stabilization', 'diagnostic', 'therapeutic', 'verify']),
});

const CLARIFYING_QUESTION = strictObject({
  id: STRING,
  question: STRING,
  why: STRING,
  criticality: oneOf(['blocker', 'important', 'optional']),
  expectedAnswerType: oneOf(['boolean', 'choice', 'number', 'text']),
  choices: nullable(arrayOf(STRING)),
  purpose: nullable(STRING),
});

const DIFFERENTIAL = strictObject({
  hypothesis: STRING,
  whyConsider: STRING,
  whatDistinguishes: STRING,
  cannotMiss: BOOLEAN,
  timeToHarm: nullable(oneOf(['minutos', 'horas', 'dias'])),
});

// A ordem dos campos é a ordem de geração: raciocínio antes das condutas.
const COPILOT_OUTPUT = strictObject({
  reasoning: STRING,
  redFlags: arrayOf(RED_FLAG),
  recommendations: arrayOf(RECOMMENDATION),
  uncertainty: BOOLEAN,
  uncertaintyReason: nullable(STRING),
  differentials: arrayOf(DIFFERENTIAL),
  clarifyingQuestions: arrayOf(CLARIFYING_QUESTION),
});

export const COPILOT_OUTPUT_JSON_SCHEMA = {
  name: 'copilot_output',
  schema: COPILOT_OUTPUT,
} satisfies JsonResponseSchema;

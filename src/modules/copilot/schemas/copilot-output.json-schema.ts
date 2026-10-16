import type { JsonResponseSchema } from '../../ai-gateway/providers/provider.interface';
import {
  arrayOf,
  BOOLEAN,
  nullable,
  NUMBER,
  oneOf,
  STRING,
  strictObject,
  type JsonSchemaNode,
} from './json-schema';

/**
 * JSON Schema do `CopilotOutputSchema` (guardrails/output-validator.ts) para
 * structured outputs. Só estrutura: limites numéricos e de tamanho
 * (confidence 0..1, máx. 3 diferenciais/perguntas, strings não vazias) e os
 * `.refine` de negócio continuam no zod, que valida a resposta depois.
 *
 * Regras do subconjunto aceito pelos dois providers em json-schema.ts;
 * copilot-output.json-schema.spec.ts garante a paridade de campos, tipos e
 * enums com o zod.
 */

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

/**
 * F1 — saída da decisão v2 (ADR-013, Etapa 3), paridade com
 * `CopilotOutputV2Schema` (guardrails/output-validator-v2.ts). Sem
 * `preliminary`: a camada diz o que depende de dado e a contenção decide o
 * rótulo. A ordem é a de geração: camada e base antes da citação.
 */
const RECOMMENDATION_V2_FIELDS = {
  action: STRING,
  rationale: STRING,
  category: oneOf(['stabilization', 'diagnostic', 'therapeutic', 'verify']),
  layer: oneOf(['now', 'depends']),
  dependsOn: nullable(STRING),
  basis: oneOf(['source', 'model_knowledge']),
  citationChunkId: nullable(STRING),
  confidence: NUMBER,
};

const RECOMMENDATION_V2 = strictObject(RECOMMENDATION_V2_FIELDS);

const CLARIFYING_QUESTION_V2 = strictObject({
  id: STRING,
  question: STRING,
  why: STRING,
  separates: arrayOf(STRING),
  criticality: oneOf(['blocker', 'important', 'optional']),
  expectedAnswerType: oneOf(['boolean', 'choice', 'number', 'text']),
  choices: nullable(arrayOf(STRING)),
  purpose: nullable(STRING),
});

function copilotOutputV2(recommendation: JsonSchemaNode) {
  return strictObject({
    reasoning: STRING,
    redFlags: arrayOf(RED_FLAG),
    recommendations: arrayOf(recommendation),
    uncertainty: BOOLEAN,
    uncertaintyReason: nullable(STRING),
    differentials: arrayOf(DIFFERENTIAL),
    clarifyingQuestions: arrayOf(CLARIFYING_QUESTION_V2),
  });
}

export const COPILOT_OUTPUT_V2_JSON_SCHEMA = {
  name: 'copilot_output_v2',
  schema: copilotOutputV2(RECOMMENDATION_V2),
} satisfies JsonResponseSchema;

/**
 * CC-601 — a v2 com a linha de "por quê" (`COPILOT_WHY_LINE`), paridade com
 * `CopilotOutputV2WhySchema`. A linha vem depois da camada e do `dependsOn`:
 * o modelo já decidiu se a conduta é "agora" quando a escreve. O teto de 120
 * caracteres fica no validador (why-line.ts), como os outros limites.
 */
const { basis, citationChunkId, confidence, ...beforeWhy } = RECOMMENDATION_V2_FIELDS;
const RECOMMENDATION_V2_WHY = strictObject({
  ...beforeWhy,
  why: nullable(STRING),
  basis,
  citationChunkId,
  confidence,
});

export const COPILOT_OUTPUT_V2_WHY_JSON_SCHEMA = {
  name: 'copilot_output_v2_why',
  schema: copilotOutputV2(RECOMMENDATION_V2_WHY),
} satisfies JsonResponseSchema;

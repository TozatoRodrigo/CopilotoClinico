import { z } from 'zod';
import { PS_SYNDROMES, type CaseUnderstanding } from '../../../shared/contracts/clinical';

/**
 * F1 — validação da Etapa 1 (ADR-013). O JSON Schema
 * (case-understanding.json-schema.ts) só garante a estrutura; os limites e as
 * regras abaixo são verificados aqui e, quando falham, viram feedback do
 * único retry. As mensagens dizem ao modelo o que corrigir.
 */

const MAX_CANNOT_MISS = 5;
const MAX_LIKELY = 3;
const MAX_MISSING_DISCRIMINATORS = 4;
const MAX_SEARCH_QUERIES = 4;

const text = z.string().trim().min(1);

/**
 * F1 — mesma decisão clínica do PI-03: o médico raciocina mal com
 * probabilidade. Só palavras: percentual aqui costuma ser medida ("SpO2 88%"),
 * e recusá-lo custaria um retry sem ganho clínico.
 */
const PROBABILITY_WORDS =
  /\bprobabilidade\b|\bprobability\b|\blikelihood\b|\bchance\s+de\b|\bodds\b/i;

const hypothesisText = text.refine((value) => !PROBABILITY_WORDS.test(value), {
  message: 'never use probability language; state the clinical reason instead',
});

export const VitalsSchema = z.object({
  systolicBp: z.number().nullable(),
  diastolicBp: z.number().nullable(),
  heartRate: z.number().nullable(),
  respiratoryRate: z.number().nullable(),
  spo2: z.number().nullable(),
  temperature: z.number().nullable(),
  glucose: z.number().nullable(),
});

const StructuredDataSchema = z.object({
  age: z.number().nullable(),
  sex: z.enum(['F', 'M']).nullable(),
  vitals: VitalsSchema,
  onset: z.string().trim().min(1).nullable(),
  keyFindings: z.array(text).max(15),
  relevantContext: z.array(text).max(10),
});

const CannotMissSchema = z.object({
  hypothesis: hypothesisText,
  whyPlausible: hypothesisText,
  confirmOrRuleOut: text,
});

const LikelySchema = z.object({
  hypothesis: hypothesisText,
  why: hypothesisText,
});

const MissingDiscriminatorSchema = z.object({
  data: text,
  separates: z.array(text).min(1).max(5),
  whyItChangesConduct: text,
});

/**
 * Campos do entendimento, sem as regras entre campos. A leitura do caso do
 * Copiloto guiado (ADR-014) estende estes campos e aplica as mesmas regras.
 */
export const CaseUnderstandingFields = z.object({
  problemRepresentation: text.max(400, 'problemRepresentation must be a single line'),
  structuredData: StructuredDataSchema,
  instability: z.object({ present: z.boolean(), findings: z.array(text).max(8) }),
  syndrome: z.enum(PS_SYNDROMES),
  syndromeNote: z.string().trim().nullable(),
  cannotMiss: z
    .array(CannotMissSchema)
    .max(MAX_CANNOT_MISS, `cannotMiss must contain at most ${MAX_CANNOT_MISS} items`),
  likely: z.array(LikelySchema).max(MAX_LIKELY, `likely must contain at most ${MAX_LIKELY} items`),
  missingDiscriminators: z
    .array(MissingDiscriminatorSchema)
    .max(
      MAX_MISSING_DISCRIMINATORS,
      `missingDiscriminators must contain at most ${MAX_MISSING_DISCRIMINATORS} items`,
    ),
  searchQueries: z
    .array(text.max(200))
    .min(1, 'searchQueries must contain at least 1 query')
    .max(MAX_SEARCH_QUERIES, `searchQueries must contain at most ${MAX_SEARCH_QUERIES} items`),
  timeCritical: z.boolean(),
});

type UnderstandingFieldsOutput = z.output<typeof CaseUnderstandingFields>;

/** Regras entre campos do entendimento: síndrome "outro" descrita e instabilidade com achados. */
export function withUnderstandingRules<Output extends UnderstandingFieldsOutput, Input>(
  schema: z.ZodType<Output, z.ZodTypeDef, Input>,
) {
  return schema
    .refine((understanding) => understanding.syndrome !== 'outro' || !!understanding.syndromeNote, {
      message: 'syndromeNote is required when syndrome is "outro": describe the syndrome',
      path: ['syndromeNote'],
    })
    .refine(
      (understanding) =>
        !understanding.instability.present || understanding.instability.findings.length > 0,
      {
        message: 'instability.findings must list the findings when instability.present is true',
        path: ['instability', 'findings'],
      },
    );
}

export const CaseUnderstandingSchema = withUnderstandingRules(CaseUnderstandingFields);

/**
 * Entendimento gravado antes de `timeCritical` existir na Etapa 1
 * (13/10/2026): o campo ausente conta como `false`. Só para ler o que já foi
 * gravado; a saída do modelo continua obrigada a trazê-lo.
 */
export const StoredCaseUnderstandingSchema = withUnderstandingRules(
  CaseUnderstandingFields.extend({ timeCritical: z.boolean().default(false) }),
);

export type StructuredValidation<Value> =
  | { valid: true; value: Value }
  | { valid: false; errors: string[] };

/**
 * Valida a saída estruturada de uma etapa. Mesmo tratamento do validador de
 * saída: modelo sem structured output às vezes embrulha o JSON em bloco de
 * código. As mensagens de erro viram o feedback do único retry.
 */
export function validateStructured<Value>(
  schema: z.ZodType<Value, z.ZodTypeDef, unknown>,
  rawOutput: string,
): StructuredValidation<Value> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      rawOutput
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim(),
    );
  } catch {
    return { valid: false, errors: ['Output is not valid JSON'] };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }
  return { valid: true, value: result.data };
}

export type UnderstandingValidation =
  | { valid: true; understanding: CaseUnderstanding }
  | { valid: false; errors: string[] };

export function validateUnderstanding(rawOutput: string): UnderstandingValidation {
  const validation = validateStructured(CaseUnderstandingSchema, rawOutput);
  return validation.valid
    ? { valid: true, understanding: validation.value }
    : { valid: false, errors: validation.errors };
}

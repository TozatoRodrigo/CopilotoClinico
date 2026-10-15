import { z } from 'zod';
import {
  INTAKE_ANSWER_TYPES,
  VITAL_SIGNS,
  type CaseUnderstanding,
} from '../../../shared/contracts/clinical';
import {
  CaseUnderstandingFields,
  validateStructured,
  VitalsSchema,
  withUnderstandingRules,
  type StructuredValidation,
} from '../understanding/case-understanding.schema';
import { MAX_INTAKE_QUESTIONS } from './intake-reading-prompt';

/**
 * ADR-014 — validação da leitura do caso. Só estrutura e tamanho: uma
 * pergunta mal formada (escolha sem opções, sinais vitais sem sinal) é
 * descartada pelo portão (intake-gate.ts) em vez de custar um retry.
 */
const text = z.string().trim().min(1);

const IntakeQuestionCandidateSchema = z.object({
  question: text.max(200, 'question must be one short sentence'),
  answerType: z.enum(INTAKE_ANSWER_TYPES),
  choices: z.array(text.max(80)).max(8),
  unit: z.string().trim().nullable(),
  vitalSigns: z.array(z.enum(VITAL_SIGNS)).max(VITAL_SIGNS.length),
  separates: z.array(text).max(5),
  why: text,
  urgentAnswers: z.array(text).max(8),
});

export type IntakeQuestionCandidate = z.infer<typeof IntakeQuestionCandidateSchema>;

type Vitals = z.infer<typeof VitalsSchema>;

/** Os sinais vitais do entendimento, na ordem do `VitalsSchema`. */
export const READING_VITAL_SIGNS = VitalsSchema.keyof().options;

/**
 * Na leitura, os sinais vitais chegam como lista — só os que o caso informa —
 * e viram o objeto do entendimento (o que falta, `null`). O objeto com sete
 * campos anuláveis, somado às perguntas, estoura a gramática do structured
 * output da Anthropic (400 "compiled grammar is too large", medido em
 * 12/10/2026): toda leitura falhava, e o caso ia ao plano sem perguntas.
 */
const ReadingVitalsSchema = z
  .array(z.object({ sign: z.enum(READING_VITAL_SIGNS), value: z.number() }))
  .refine((vitals) => new Set(vitals.map(({ sign }) => sign)).size === vitals.length, {
    message: 'list each vital sign at most once',
  })
  .transform(
    (vitals): Vitals => ({
      ...(Object.fromEntries(READING_VITAL_SIGNS.map((sign) => [sign, null])) as Vitals),
      ...Object.fromEntries(vitals.map(({ sign, value }) => [sign, value])),
    }),
  );

const IntakeReadingFields = CaseUnderstandingFields.extend({
  intakeQuestions: z
    .array(IntakeQuestionCandidateSchema)
    .max(
      MAX_INTAKE_QUESTIONS,
      `intakeQuestions must contain at most ${MAX_INTAKE_QUESTIONS} questions`,
    ),
});

/** A leitura que o modelo escreve, com os sinais vitais em lista. */
export const IntakeReadingSchema = withUnderstandingRules(
  IntakeReadingFields.extend({
    structuredData: CaseUnderstandingFields.shape.structuredData.extend({
      vitals: ReadingVitalsSchema,
    }),
  }),
);

/** A leitura gravada em case_intakes.reading: já no formato do entendimento. */
export const StoredIntakeReadingSchema = withUnderstandingRules(IntakeReadingFields);

export type IntakeReading = z.output<typeof IntakeReadingSchema>;
/** A leitura como o modelo a escreve: sinais vitais em lista. */
export type IntakeReadingWire = z.input<typeof IntakeReadingSchema>;

export function validateIntakeReading(rawOutput: string): StructuredValidation<IntakeReading> {
  return validateStructured(IntakeReadingSchema, rawOutput);
}

/** O entendimento contido na leitura, no contrato da Etapa 1 — vai para a análise sem refazer a etapa. */
export function understandingOf(reading: IntakeReading): CaseUnderstanding {
  return {
    problemRepresentation: reading.problemRepresentation,
    structuredData: reading.structuredData,
    instability: reading.instability,
    syndrome: reading.syndrome,
    syndromeNote: reading.syndromeNote,
    cannotMiss: reading.cannotMiss,
    likely: reading.likely,
    missingDiscriminators: reading.missingDiscriminators,
    searchQueries: reading.searchQueries,
    timeCritical: reading.timeCritical,
  };
}

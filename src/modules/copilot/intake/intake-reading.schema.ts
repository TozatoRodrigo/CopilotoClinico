import { z } from 'zod';
import {
  INTAKE_ANSWER_TYPES,
  VITAL_SIGNS,
  type CaseUnderstanding,
} from '../../../shared/contracts/clinical';
import {
  CaseUnderstandingFields,
  validateStructured,
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

export const IntakeReadingSchema = withUnderstandingRules(
  CaseUnderstandingFields.extend({
    timeCritical: z.boolean(),
    intakeQuestions: z
      .array(IntakeQuestionCandidateSchema)
      .max(
        MAX_INTAKE_QUESTIONS,
        `intakeQuestions must contain at most ${MAX_INTAKE_QUESTIONS} questions`,
      ),
  }),
);

export type IntakeReading = z.infer<typeof IntakeReadingSchema>;

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
  };
}

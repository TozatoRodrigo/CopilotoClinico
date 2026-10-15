import type { JsonResponseSchema } from '../../ai-gateway/providers/provider.interface';
import { INTAKE_ANSWER_TYPES, VITAL_SIGNS } from '../../../shared/contracts/clinical';
import { CASE_UNDERSTANDING_PROPERTIES } from '../understanding/case-understanding.json-schema';
import { READING_VITAL_SIGNS } from './intake-reading.schema';
import { arrayOf, nullable, NUMBER, oneOf, STRING, strictObject } from '../schemas/json-schema';

/**
 * ADR-014 — JSON Schema da leitura do caso (intake-reading.schema.ts). Os
 * campos do entendimento vêm primeiro e na mesma ordem da Etapa 1: o modelo
 * entende o caso antes de decidir o que perguntar.
 */
const INTAKE_QUESTION = strictObject({
  question: STRING,
  answerType: oneOf(INTAKE_ANSWER_TYPES),
  choices: arrayOf(STRING),
  unit: nullable(STRING),
  vitalSigns: arrayOf(oneOf(VITAL_SIGNS)),
  separates: arrayOf(STRING),
  why: STRING,
  urgentAnswers: arrayOf(STRING),
});

// Sinais vitais em lista, não no objeto de campos anuláveis da Etapa 1: cada
// anulável é uma união na gramática, e com as perguntas a leitura passava do
// limite da Anthropic (ver ReadingVitalsSchema).
const READING_VITALS = arrayOf(strictObject({ sign: oneOf(READING_VITAL_SIGNS), value: NUMBER }));

export const INTAKE_READING_JSON_SCHEMA = {
  name: 'case_intake_reading',
  schema: strictObject({
    ...CASE_UNDERSTANDING_PROPERTIES,
    structuredData: strictObject({
      ...CASE_UNDERSTANDING_PROPERTIES.structuredData.properties,
      vitals: READING_VITALS,
    }),
    intakeQuestions: arrayOf(INTAKE_QUESTION),
  }),
} satisfies JsonResponseSchema;

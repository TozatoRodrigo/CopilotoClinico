import { z } from 'zod';
import {
  INTAKE_ANSWER_CHANNELS,
  INTAKE_ANSWER_TYPES,
  VITAL_SIGNS,
  type IntakeAnswer,
} from '../../../shared/contracts/clinical';
import type { IntakeQuestionRecord } from './intake-gate';

/**
 * ADR-014 — faixas plausíveis de sinais vitais. Servem para pegar erro de
 * digitação ("1500" na PA), não para julgar o valor clínico.
 */
const vital = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();

export const vitalsAnswerSchema = z
  .object({
    systolicBp: vital(20, 300),
    diastolicBp: vital(10, 200),
    heartRate: vital(10, 300),
    respiratoryRate: vital(2, 80),
    spo2: vital(30, 100),
    temperature: vital(25, 45),
    glucose: vital(10, 2000),
  })
  .refine((vitals) => Object.values(vitals).some((value) => value !== null), {
    message: 'Informe ao menos um sinal vital',
  });

export const answerIntakeSchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  answer: z.union([
    z.string().trim().min(1, 'A resposta não pode ficar vazia').max(2000),
    z.number().finite(),
    vitalsAnswerSchema,
  ]),
  channel: z.enum(INTAKE_ANSWER_CHANNELS),
});

export type AnswerIntakeInput = z.infer<typeof answerIntakeSchema>;

/**
 * Formato guardado em `case_intakes.questions` e `.answers`. O JSON volta do
 * banco sem tipo: é validado ao ler, e um registro fora do formato vira
 * lista vazia em vez de quebrar a conversa.
 */
const storedQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  answerType: z.enum(INTAKE_ANSWER_TYPES),
  choices: z.array(z.string()),
  unit: z.string().nullable(),
  vitalSigns: z.array(z.enum(VITAL_SIGNS)),
  separates: z.array(z.string()),
  why: z.string(),
  urgentAnswers: z.array(z.string()),
});

const storedAnswerSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string(),
  channel: z.enum(INTAKE_ANSWER_CHANNELS),
  answeredAt: z.string(),
});

export function readStoredQuestions(value: unknown): IntakeQuestionRecord[] {
  const parsed = z.array(storedQuestionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function readStoredAnswers(value: unknown): IntakeAnswer[] {
  const parsed = z.array(storedAnswerSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

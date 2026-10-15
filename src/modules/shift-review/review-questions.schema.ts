import { z } from 'zod';
import type { JsonResponseSchema } from '../ai-gateway/providers/provider.interface';
import {
  SHIFT_REVIEW_QUESTION_FORMATS,
  TRUE_FALSE_OPTIONS,
} from '../../shared/contracts/shift-review';
import { maskPII } from '../copilot/guardrails/pii-filter';
import { arrayOf, NUMBER, oneOf, STRING, strictObject } from '../copilot/schemas/json-schema';
import type { ReviewMaterial, ReviewSource } from './review-material';
import { QUESTIONS_PER_REVIEW } from './shift-review.settings';

/**
 * CC-801 — saída da etapa `review_questions`. O JSON Schema só garante a
 * estrutura; os limites ficam no zod e as regras que dependem do material
 * (fonte listada, nenhum dado do paciente) em `checkReviewQuestions`. As
 * mensagens viram o feedback do único retry: dizem ao modelo o que corrigir.
 */

const text = z.string().trim().min(1);

export const ReviewQuestionDraftSchema = z.object({
  sourceKey: text.max(8),
  topic: text.max(80, 'topic must have at most 80 characters'),
  format: z.enum(SHIFT_REVIEW_QUESTION_FORMATS),
  stem: text.max(400, 'stem must have at most 400 characters'),
  options: z.array(text.max(200, 'each option must have at most 200 characters')),
  correctOption: z.number().int('correctOption must be an integer index'),
  explanation: text.max(600, 'explanation must have at most 600 characters'),
});

export type ReviewQuestionDraft = z.output<typeof ReviewQuestionDraftSchema>;

export const ReviewQuestionsOutputSchema = z.object({
  questions: z
    .array(ReviewQuestionDraftSchema)
    .min(1, 'questions must contain at least 1 question')
    .max(QUESTIONS_PER_REVIEW, `questions must contain at most ${QUESTIONS_PER_REVIEW} questions`),
});

export type ReviewQuestionsOutput = z.output<typeof ReviewQuestionsOutputSchema>;

/**
 * Ordem dos campos = ordem de geração: primeiro a fonte e o tema, depois a
 * pergunta, as alternativas, a certa e a explicação — a pergunta nasce do
 * trecho, não o contrário.
 */
export const REVIEW_QUESTIONS_JSON_SCHEMA = {
  name: 'shift_review_questions',
  schema: strictObject({
    questions: arrayOf(
      strictObject({
        sourceKey: STRING,
        topic: STRING,
        format: oneOf(SHIFT_REVIEW_QUESTION_FORMATS),
        stem: STRING,
        options: arrayOf(STRING),
        correctOption: NUMBER,
        explanation: STRING,
      }),
    ),
  }),
} satisfies JsonResponseSchema;

/** Uma pergunta que passou em todas as regras, já ligada à fonte da análise. */
export interface CheckedReviewQuestion {
  draft: ReviewQuestionDraft;
  source: ReviewSource;
}

export interface ReviewQuestionsCheck {
  accepted: CheckedReviewQuestion[];
  errors: string[];
}

const MIN_CHOICES = 3;
const MAX_CHOICES = 5;

/** Marcas que a máscara deixa no texto: a pergunta copiou o caso. */
const REDACTION_MARKERS = ['[REDACTED_', '[PATIENT_REF_REDACTED]'];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

/**
 * Dado do paciente numa pergunta: o que a máscara de PII pega, as marcas da
 * máscara copiadas do material e o patientRef de qualquer caso da revisão.
 */
export function carriesPatientData(value: string, patientRefs: readonly string[]): boolean {
  if (maskPII(value).hasPII) return true;
  if (REDACTION_MARKERS.some((marker) => value.includes(marker))) return true;
  return patientRefs.some((ref) => ref.length > 0 && value.includes(ref));
}

function optionErrors(draft: ReviewQuestionDraft, path: string): string[] {
  const errors: string[] = [];
  if (draft.format === 'true_false') {
    const expected = TRUE_FALSE_OPTIONS.map(normalize);
    if (
      draft.options.length !== expected.length ||
      draft.options.some((option, index) => normalize(option) !== expected[index])
    ) {
      errors.push(`${path}.options: true_false options must be exactly ["Verdadeiro", "Falso"]`);
    }
  } else {
    if (draft.options.length < MIN_CHOICES || draft.options.length > MAX_CHOICES) {
      errors.push(`${path}.options: multiple_choice must have 4 options`);
    }
    if (new Set(draft.options.map(normalize)).size !== draft.options.length) {
      errors.push(`${path}.options: options must be different from each other`);
    }
  }
  if (draft.correctOption < 0 || draft.correctOption >= draft.options.length) {
    errors.push(`${path}.correctOption: must be the zero-based index of one of the options`);
  }
  return errors;
}

/**
 * Regras que dependem do material: a fonte tem de ser uma das que as análises
 * citaram (nunca inventada) e nenhum texto pode trazer dado do paciente.
 * Pergunta que falha fica de fora; as demais seguem.
 */
export function checkReviewQuestions(
  output: ReviewQuestionsOutput,
  material: Pick<ReviewMaterial, 'sources' | 'patientRefs'>,
): ReviewQuestionsCheck {
  const accepted: CheckedReviewQuestion[] = [];
  const errors: string[] = [];
  const seenStems = new Set<string>();

  output.questions.forEach((draft, index) => {
    const path = `questions.${index}`;
    const questionErrors: string[] = [];
    const source = material.sources.get(draft.sourceKey.trim().toUpperCase());
    if (!source) {
      questionErrors.push(
        `${path}.sourceKey: "${draft.sourceKey}" is not one of the listed sources; cite only a key from <sources>`,
      );
    }
    questionErrors.push(...optionErrors(draft, path));
    const texts = [draft.stem, draft.topic, draft.explanation, ...draft.options];
    if (texts.some((value) => carriesPatientData(value, material.patientRefs))) {
      questionErrors.push(
        `${path}: contains patient data; write about the clinical topic, never about the patient`,
      );
    }
    if (seenStems.has(normalize(draft.stem))) {
      questionErrors.push(`${path}.stem: repeats another question`);
    }
    seenStems.add(normalize(draft.stem));

    if (questionErrors.length > 0 || !source) {
      errors.push(...questionErrors);
      return;
    }
    accepted.push({ draft, source });
  });

  return { accepted, errors };
}

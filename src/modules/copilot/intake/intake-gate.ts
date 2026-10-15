import {
  BOOLEAN_ANSWER_CHOICES,
  type CaseUnderstanding,
  type IntakeQuestion,
  type VitalSign,
} from '../../../shared/contracts/clinical';
import { knownDataAskedBy } from '../guardrails/output-validator-v2';
import { normalize } from '../guardrails/output-validator';
import { MAX_INTAKE_QUESTIONS } from './intake-reading-prompt';
import type { IntakeQuestionCandidate, IntakeReading } from './intake-reading.schema';

/**
 * ADR-014 — portão do Copiloto guiado: decide, por código, se o médico
 * recebe perguntas antes do plano. O modelo só propõe as perguntas; o teto,
 * o paciente instável e o dado já informado são regra daqui (lição da v2:
 * quando o modelo decide sozinho, "até 3" vira "3").
 */

/** A pergunta como fica guardada: a de tela mais as respostas que encerram as perguntas. */
export interface IntakeQuestionRecord extends IntakeQuestion {
  urgentAnswers: string[];
}

export type IntakeDecision =
  | { path: 'ask'; questions: IntakeQuestionRecord[] }
  | { path: 'unstable' | 'complete'; questions: [] };

/** Quadro tempo-dependente: uma pergunta, no máximo, antes do plano. */
const TIME_CRITICAL_QUESTION_LIMIT = 1;
const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

type Vitals = CaseUnderstanding['structuredData']['vitals'];

const VITAL_SIGN_KNOWN: Record<VitalSign, (vitals: Vitals) => boolean> = {
  bloodPressure: (vitals) => vitals.systolicBp !== null || vitals.diastolicBp !== null,
  heartRate: (vitals) => vitals.heartRate !== null,
  respiratoryRate: (vitals) => vitals.respiratoryRate !== null,
  spo2: (vitals) => vitals.spo2 !== null,
  temperature: (vitals) => vitals.temperature !== null,
  glucose: (vitals) => vitals.glucose !== null,
};

type StructuredData = CaseUnderstanding['structuredData'];
type QuestionDraft = Omit<IntakeQuestionRecord, 'id'>;

function uniqueTrimmed(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = normalize(value);
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Resposta urgente escrita como uma das opções da pergunta — senão, não vale. */
function matchChoices(answers: readonly string[], choices: readonly string[]): string[] {
  return uniqueTrimmed(
    answers.flatMap((answer) =>
      choices.filter((choice) => normalize(choice) === normalize(answer)),
    ),
  );
}

const DRAFT_BY_TYPE: Record<
  IntakeQuestionCandidate['answerType'],
  (candidate: IntakeQuestionCandidate, structuredData: StructuredData) => QuestionDraft | null
> = {
  boolean: (candidate) => ({
    ...baseDraft(candidate),
    choices: [...BOOLEAN_ANSWER_CHOICES],
    urgentAnswers: matchChoices(candidate.urgentAnswers, BOOLEAN_ANSWER_CHOICES),
  }),
  choice: (candidate) => {
    const choices = uniqueTrimmed(candidate.choices).slice(0, MAX_CHOICES);
    if (choices.length < MIN_CHOICES) return null;
    return {
      ...baseDraft(candidate),
      choices,
      urgentAnswers: matchChoices(candidate.urgentAnswers, choices),
    };
  },
  number: (candidate) => ({ ...baseDraft(candidate), unit: candidate.unit?.trim() || null }),
  text: (candidate) => baseDraft(candidate),
  vitals: (candidate, structuredData) => {
    const vitalSigns = [...new Set(candidate.vitalSigns)].filter(
      (sign) => !VITAL_SIGN_KNOWN[sign](structuredData.vitals),
    );
    if (vitalSigns.length === 0) return null;
    return { ...baseDraft(candidate), vitalSigns };
  },
};

function baseDraft(candidate: IntakeQuestionCandidate): QuestionDraft {
  return {
    question: candidate.question.trim(),
    answerType: candidate.answerType,
    choices: [],
    unit: null,
    vitalSigns: [],
    separates: uniqueTrimmed(candidate.separates),
    why: candidate.why.trim(),
    urgentAnswers: [],
  };
}

function draftQuestion(
  candidate: IntakeQuestionCandidate,
  structuredData: StructuredData,
): QuestionDraft | null {
  // Sinais vitais se conferem um a um, pelo `vitalSigns`; nas outras, o
  // texto da pergunta não pode pedir um dado que o caso já deu.
  const asksKnownData =
    candidate.answerType !== 'vitals' &&
    knownDataAskedBy(candidate.question, structuredData).length > 0;
  if (asksKnownData) return null;
  return DRAFT_BY_TYPE[candidate.answerType](candidate, structuredData);
}

function keepOneVitalsQuestion(questions: QuestionDraft[]): QuestionDraft[] {
  const firstVitals = questions.findIndex((question) => question.answerType === 'vitals');
  return questions.filter(
    (question, index) => question.answerType !== 'vitals' || index === firstVitals,
  );
}

export function decideIntake(reading: IntakeReading): IntakeDecision {
  if (reading.instability.present) return { path: 'unstable', questions: [] };

  const limit = reading.timeCritical ? TIME_CRITICAL_QUESTION_LIMIT : MAX_INTAKE_QUESTIONS;
  const drafts = reading.intakeQuestions.flatMap((candidate) => {
    const draft = draftQuestion(candidate, reading.structuredData);
    return draft ? [draft] : [];
  });
  const questions = keepOneVitalsQuestion(drafts)
    .slice(0, limit)
    .map((question, index) => ({ id: `intake-${index + 1}`, ...question }));

  if (questions.length === 0) return { path: 'complete', questions: [] };
  return { path: 'ask', questions };
}

/** A pergunta de tela, sem as respostas urgentes, que só o servidor usa. */
export function toIntakeQuestion(question: IntakeQuestionRecord): IntakeQuestion {
  return {
    id: question.id,
    question: question.question,
    answerType: question.answerType,
    choices: question.choices,
    unit: question.unit,
    vitalSigns: question.vitalSigns,
    separates: question.separates,
    why: question.why,
  };
}

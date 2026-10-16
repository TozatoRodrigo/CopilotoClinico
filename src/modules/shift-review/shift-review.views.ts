import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { CITATION_ORIGINS, PS_SYNDROMES, type PsSyndrome } from '../../shared/contracts/clinical';
import {
  SHIFT_REVIEW_CONFIDENCES,
  type ShiftReviewConfidence,
  type ShiftReviewQuestionView,
  type ShiftReviewSource,
  type ShiftReviewSummary,
  type ShiftReviewView,
} from '../../shared/contracts/shift-review';
import type { ShiftReviewStoredSource } from './review-material';
import { formatPeriodStart } from './review-period';

/** O que a tela precisa da revisão: as perguntas na ordem e o título do caso de cada uma. */
export const REVIEW_INCLUDE = {
  questions: {
    orderBy: { position: 'asc' },
    include: { encounter: { select: { chiefComplaint: true } } },
  },
} as const satisfies Prisma.ShiftReviewInclude;

export type ReviewRecord = Prisma.ShiftReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;
type QuestionRecord = ReviewRecord['questions'][number];

const OptionsSchema = z.array(z.string());

/** Leitura do JSON gravado em `shift_review_questions.source`. */
const StoredSourceSchema: z.ZodType<ShiftReviewStoredSource, z.ZodTypeDef, unknown> =
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('analysis_citation'),
      chunkId: z.string(),
      title: z.string(),
      version: z.string().nullable(),
      origin: z.enum(CITATION_ORIGINS).nullable(),
      url: z.string().nullable(),
      excerpt: z.string(),
    }),
    z.object({
      kind: z.literal('knowledge_card'),
      cardId: z.string(),
      versionId: z.string(),
      title: z.string(),
      version: z.null(),
      origin: z.null(),
      url: z.null(),
      excerpt: z.string(),
    }),
  ]);

const SyndromeSchema = z.enum(PS_SYNDROMES).nullable().catch(null);

/** Síndrome gravada na pergunta; fora da lista fechada vira `null`. */
export function parseSyndrome(syndrome: string | null): PsSyndrome | null {
  return SyndromeSchema.parse(syndrome);
}

export function parseOptions(options: Prisma.JsonValue): string[] {
  const parsed = OptionsSchema.safeParse(options);
  return parsed.success ? parsed.data : [];
}

/** A fonte gravada na pergunta; `null` se o JSON não tiver a forma esperada. */
export function parseStoredSource(source: Prisma.JsonValue): ShiftReviewStoredSource | null {
  const parsed = StoredSourceSchema.safeParse(source);
  return parsed.success ? parsed.data : null;
}

function sourceView(source: Prisma.JsonValue): ShiftReviewSource {
  const stored = parseStoredSource(source);
  if (!stored) {
    return {
      title: 'Fonte citada na análise',
      version: null,
      origin: null,
      url: null,
      excerpt: '',
    };
  }
  const { title, version, origin, url, excerpt } = stored;
  return { title, version, origin, url, excerpt };
}

/** A resposta certa, a explicação e a fonte só vão para a tela depois da resposta. */
export function questionView(question: QuestionRecord): ShiftReviewQuestionView {
  const { answeredAt, chosenOption, confidence, correct } = question;
  const answered =
    answeredAt !== null && chosenOption !== null && confidence !== null && correct !== null;
  return {
    id: question.id,
    position: question.position,
    format: question.format,
    stem: question.stem,
    options: parseOptions(question.options),
    topic: question.topic,
    syndrome: parseSyndrome(question.syndrome),
    answer: answered
      ? {
          chosenOption,
          confidence,
          correct,
          correctOption: question.correctOption,
          explanation: question.explanation,
          source: sourceView(question.source),
          encounterId: question.encounterId,
          caseTitle: question.encounter.chiefComplaint,
          answeredAt: answeredAt.toISOString(),
        }
      : null,
  };
}

/**
 * Acertos por grau de certeza. Recebe linhas soltas (não a revisão) para o
 * mapa de calibração (CC-802) somar por tema com a mesma regra.
 */
export function summarizeAnswers(
  questions: ReadonlyArray<{ confidence: ShiftReviewConfidence | null; correct: boolean | null }>,
): ShiftReviewSummary {
  const byConfidence = Object.fromEntries(
    SHIFT_REVIEW_CONFIDENCES.map((confidence) => [confidence, { answered: 0, correct: 0 }]),
  ) as ShiftReviewSummary['byConfidence'];
  let answered = 0;
  let correct = 0;
  for (const question of questions) {
    if (question.confidence === null || question.correct === null) continue;
    answered += 1;
    byConfidence[question.confidence].answered += 1;
    if (question.correct) {
      correct += 1;
      byConfidence[question.confidence].correct += 1;
    }
  }
  return { total: questions.length, answered, correct, byConfidence };
}

export function reviewView(review: ReviewRecord): ShiftReviewView {
  return {
    id: review.id,
    periodStart: formatPeriodStart(review.periodStart),
    generatedAt: review.generatedAt?.toISOString() ?? null,
    completedAt: review.completedAt?.toISOString() ?? null,
    questions: review.questions.map(questionView),
    summary: summarizeAnswers(review.questions),
  };
}

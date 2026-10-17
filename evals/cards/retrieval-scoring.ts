import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * CC-406 — gabarito da busca nos cartões: perguntas de plantão, cada uma com
 * o(s) cartão(ões) que deveriam vir no top-3. Mede o provedor de embedding
 * sem tocar no índice de produção: cartões e perguntas são embutidos em
 * memória com o mesmo texto da indexação (`cardEmbeddingText`) e ranqueados
 * pelo cosseno.
 *
 * Meta da CC-406: acerto top-3 ≥ 85% em 50 perguntas.
 */

const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'id em kebab-case'),
    /** Como o médico perguntaria — curta, sem dado de paciente. */
    question: z.string().trim().min(5).max(300),
    /**
     * Tema (`knowledge_cards.topic`, sem caixa) ou id de cartão esperado. Mais
     * de um quando dois cartões respondem igualmente bem.
     */
    expected: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const QuestionsFileSchema = z
  .object({ questions: z.array(QuestionSchema).min(1) })
  .strict()
  .refine(
    (file) => new Set(file.questions.map((question) => question.id)).size === file.questions.length,
    { message: 'ids de pergunta repetidos' },
  );

export type RetrievalQuestion = z.infer<typeof QuestionSchema>;

export function loadRetrievalQuestions(filePath: string): RetrievalQuestion[] {
  const parsed = QuestionsFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`${filePath} inválido:\n${issues}`);
  }
  return parsed.data.questions;
}

export interface CardVector {
  cardId: string;
  topic: string;
  vector: readonly number[];
}

export function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) {
    throw new Error(`vetores de dimensões diferentes: ${left.length} × ${right.length}`);
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i]! * right[i]!;
    leftNorm += left[i]! * left[i]!;
    rightNorm += right[i]! * right[i]!;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export interface RankedCard {
  cardId: string;
  topic: string;
  similarity: number;
}

/** Cartões do mais ao menos parecido com a pergunta; empate fica na ordem recebida. */
export function rankCards(query: readonly number[], cards: readonly CardVector[]): RankedCard[] {
  return cards
    .map((card) => ({
      cardId: card.cardId,
      topic: card.topic,
      similarity: cosine(query, card.vector),
    }))
    .sort((left, right) => right.similarity - left.similarity);
}

const normalizeTopic = (value: string) => value.trim().toLowerCase();

function matches(card: RankedCard, expected: readonly string[]): boolean {
  return expected.some(
    (target) => target === card.cardId || normalizeTopic(target) === normalizeTopic(card.topic),
  );
}

export interface QuestionResult {
  id: string;
  /** Posição (1 = primeiro) do primeiro cartão esperado; `null` se nenhum veio. */
  rank: number | null;
  topK: RankedCard[];
}

export interface RetrievalScore {
  total: number;
  k: number;
  hitAt1: number;
  hitAtK: number;
  /** Média de 1/posição do primeiro acerto (0 sem acerto). */
  mrr: number;
  /** Perguntas sem o cartão esperado no top-k. */
  misses: QuestionResult[];
}

export function judgeQuestion(
  question: RetrievalQuestion,
  ranked: readonly RankedCard[],
  k: number,
): QuestionResult {
  const index = ranked.findIndex((card) => matches(card, question.expected));
  return { id: question.id, rank: index >= 0 ? index + 1 : null, topK: ranked.slice(0, k) };
}

export function scoreRetrieval(results: readonly QuestionResult[], k: number): RetrievalScore {
  const total = results.length;
  const ratio = (count: number) => (total === 0 ? 0 : count / total);
  return {
    total,
    k,
    hitAt1: ratio(results.filter((result) => result.rank === 1).length),
    hitAtK: ratio(results.filter((result) => result.rank !== null && result.rank <= k).length),
    mrr: ratio(results.reduce((sum, result) => sum + (result.rank ? 1 / result.rank : 0), 0)),
    misses: results.filter((result) => result.rank === null || result.rank > k),
  };
}

/** Expectativa que não casa com nenhum cartão publicado: erro de digitação no gabarito. */
export function unknownExpectations(
  questions: readonly RetrievalQuestion[],
  cards: ReadonlyArray<{ cardId: string; topic: string }>,
): string[] {
  const known = new Set(cards.flatMap((card) => [card.cardId, normalizeTopic(card.topic)]));
  return questions.flatMap((question) =>
    question.expected
      .filter((target) => !known.has(target) && !known.has(normalizeTopic(target)))
      .map((target) => `${question.id}: "${target}"`),
  );
}

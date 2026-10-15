import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PsSyndrome } from '../../../shared/contracts/clinical';
import type { KnowledgeCardContent, ReviewedCard } from '../../../shared/contracts/knowledge-cards';
import { readReviewedCardsSettings } from './reviewed-cards.settings';

/**
 * CC-408 — portão de relevância: decide, para cada cartão que a busca
 * semântica achou, se ele se aplica ao caso. A busca só diz "parecido"; um
 * cartão de outro cenário com dose liberada é exatamente o erro que motivou o
 * plano de confiabilidade (dengue conduzida como sepse).
 *
 * CC-407: o Jev (TypeSafe) e um reranker são outras implementações de
 * `CardRelevanceGate`; a `ConfiguredRelevanceGate` escolhe a cada análise
 * (`CARD_RELEVANCE_GATE=threshold|jev|reranker`), sem mexer na busca nem na
 * decisão. O portão recebe só o que a Etapa 1 entendeu do caso — nunca o
 * texto do caso.
 */

/**
 * O que o portão lê do cartão: tema, síndrome, pergunta, população, resposta
 * e o texto das afirmações. Nunca o revisor nem as fontes — e o gabarito da
 * CC-407 monta cartões só com isto.
 */
export type RelevanceCard = Pick<ReviewedCard, 'cardId' | 'topic' | 'syndrome'> & {
  content: Pick<KnowledgeCardContent, 'question' | 'population' | 'answer'> & {
    claims: ReadonlyArray<{ text: string }>;
  };
};

/** Um cartão achado pela busca, com a similaridade com a consulta mais próxima. */
export interface CardCandidate<TCard extends RelevanceCard = ReviewedCard> {
  card: TCard;
  similarity: number;
}

export interface CardRelevanceContext {
  /** Síndrome de PS do caso (Etapa 1); `null` quando não há (pergunta rápida, CC-501). */
  syndrome: PsSyndrome | null;
  /** Hipóteses do caso, graves e prováveis (Etapa 1) — ou a pergunta, na CC-501. */
  hypotheses: readonly string[];
  /**
   * Representação do problema (Etapa 1): o que um portão que lê texto recebe.
   * Escrita pelo modelo a partir do caso já redigido; nunca o texto bruto.
   */
  problemRepresentation: string | null;
}

export const CARD_RELEVANCE_REASONS = [
  'applies',
  'below_similarity',
  'syndrome_mismatch',
  'topic_mismatch',
  /** Reservado ao portão da CC-407: o modelo/reranker disse que não se aplica. */
  'gate_rejected',
] as const;
export type CardRelevanceReason = (typeof CARD_RELEVANCE_REASONS)[number];

export interface CardRelevanceVerdict {
  cardId: string;
  applies: boolean;
  reason: CardRelevanceReason;
  /** Probabilidade calibrada (Jev) ou escore do reranker; `null` no portão por similaridade. */
  score: number | null;
}

/**
 * CC-407 — por que o portão configurado não decidiu e o por similaridade
 * decidiu no lugar: sem chave/serviço (`*_unconfigured`) ou falha (`*_failed`).
 */
export type CardGateFallbackReason =
  | 'jev_unconfigured'
  | 'jev_failed'
  | 'reranker_unconfigured'
  | 'reranker_failed';

export interface CardRelevanceJudgement {
  /** O portão que decidiu de fato — com fallback, o por similaridade. */
  gate: string;
  fallback: CardGateFallbackReason | null;
  /** Um veredito por candidato, na mesma ordem. */
  verdicts: CardRelevanceVerdict[];
}

export interface CardRelevanceGate {
  /** O portão configurado agora: vai para o log e para a trilha técnica da análise. */
  readonly name: string;
  /** Lançar = nenhum cartão nesta análise. */
  judge(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceJudgement>;
}

/** CC-407 — o escore de cada candidato, na mesma ordem, e o que a chamada custou. */
export interface CardGateScores {
  scores: number[];
  /** Modelo que serviu (ex.: `jev-1.13.0`, `BAAI/bge-reranker-v2-m3`). */
  model: string;
  /** `null` quando o provedor não diz (ou não cobra por token). */
  inputTokens: number | null;
  latencyMs: number;
}

/**
 * CC-407 — portão que dá um escore por candidato e aplica um limiar (Jev,
 * reranker). O bake-off (`pnpm eval:card-gate`) lê os escores para
 * calibrar o limiar; a análise usa `judge`.
 */
export interface ScoredCardRelevanceGate extends CardRelevanceGate {
  /** Com chave/serviço no ambiente, o portão pode rodar. */
  configured(): boolean;
  /** US$ por milhão de tokens de entrada (0 no serviço local): o custo do bake-off. */
  readonly usdPerMillionInputTokens: number;
  /** Tokens de entrada estimados antes de chamar: o freio de gasto do bake-off. */
  estimateInputTokens(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): number;
  /** Lança sem chave/serviço, com o provedor fora ou com resposta fora do contrato. */
  score(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardGateScores>;
}

export const CARD_RELEVANCE_GATE = Symbol('CARD_RELEVANCE_GATE');

const STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'por',
  'com',
  'sem',
  'em',
  'na',
  'no',
  'nas',
  'nos',
  'ou',
  'para',
  'pelo',
  'pela',
  'aguda',
  'agudo',
  'grave',
  'adulto',
  'crianca',
]);
/** Radical de 6 letras: "hemorragia" e "hemorrágico" contam como o mesmo termo. */
const STEM_LENGTH = 6;

function stems(text: string): string[] {
  return [
    ...new Set(
      text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
        .map((word) => word.slice(0, STEM_LENGTH)),
    ),
  ];
}

/** Ao menos metade dos termos de `text` aparece em `pool`. */
function coveredBy(text: string, pool: ReadonlySet<string>): boolean {
  const terms = stems(text);
  if (terms.length === 0) return false;
  return terms.filter((term) => pool.has(term)).length >= Math.ceil(terms.length / 2);
}

/**
 * O tema do cartão é o do caso: o tema aparece no que a Etapa 1 entendeu, ou
 * uma hipótese do caso aparece no tema ("Anafilaxia" × "Anafilaxia: adrenalina
 * IM"). Heurística de propósito simples e conservadora: errar aqui tira o
 * cartão e a análise segue como antes dos cartões, sem dose.
 */
export function topicMatchesCase(topic: string, context: CardRelevanceContext): boolean {
  const caseTerms = new Set(
    stems([...context.hypotheses, context.problemRepresentation ?? ''].join(' ')),
  );
  if (coveredBy(topic, caseTerms)) return true;
  const topicTerms = new Set(stems(topic));
  return context.hypotheses.some((hypothesis) => coveredBy(hypothesis, topicTerms));
}

/** Síndrome que separa cenários; `outro` não separa nada. */
function specificSyndrome(syndrome: string | null): string | null {
  return syndrome && syndrome !== 'outro' ? syndrome : null;
}

/**
 * Portão por limiar (CC-408): similaridade mínima e tema. Segue o padrão até
 * o bake-off da CC-407 escolher entre ele, o Jev e o reranker.
 *
 * 1. Similaridade abaixo do mínimo: não se aplica.
 * 2. Cartão e caso com síndrome definida: só a mesma síndrome se aplica — o
 *    cartão de dor torácica não entra no caso de dispneia.
 * 3. Sem síndrome definida de um dos lados (cartão genérico, caso `outro`,
 *    pergunta rápida): o tema do cartão precisa estar nas hipóteses do caso.
 */
export function judgeBySimilarityAndTheme(
  candidate: CardCandidate<RelevanceCard>,
  context: CardRelevanceContext,
  minSimilarity: number,
): CardRelevanceVerdict {
  const verdict = (applies: boolean, reason: CardRelevanceReason): CardRelevanceVerdict => ({
    cardId: candidate.card.cardId,
    applies,
    reason,
    score: null,
  });
  if (candidate.similarity < minSimilarity) return verdict(false, 'below_similarity');

  const cardSyndrome = specificSyndrome(candidate.card.syndrome);
  const caseSyndrome = specificSyndrome(context.syndrome);
  if (cardSyndrome && caseSyndrome) {
    return cardSyndrome === caseSyndrome
      ? verdict(true, 'applies')
      : verdict(false, 'syndrome_mismatch');
  }
  return topicMatchesCase(candidate.card.topic, context)
    ? verdict(true, 'applies')
    : verdict(false, 'topic_mismatch');
}

export const SIMILARITY_THEME_GATE_NAME = 'similarity-theme';

/**
 * O portão por limiar (`CARD_RELEVANCE_GATE=threshold`, o padrão):
 * `judgeBySimilarityAndTheme` com o limiar do ambiente. Não chama ninguém e
 * não falha — é onde o Jev e o reranker caem sem chave ou fora do ar.
 */
@Injectable()
export class SimilarityThemeGate implements CardRelevanceGate {
  readonly name = SIMILARITY_THEME_GATE_NAME;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async judge(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceJudgement> {
    const { minSimilarity } = readReviewedCardsSettings(this.config);
    return {
      gate: this.name,
      fallback: null,
      verdicts: candidates.map((candidate) =>
        judgeBySimilarityAndTheme(candidate, context, minSimilarity),
      ),
    };
  }
}

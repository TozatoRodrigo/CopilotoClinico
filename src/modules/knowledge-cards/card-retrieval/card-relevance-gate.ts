import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PsSyndrome } from '../../../shared/contracts/clinical';
import type { ReviewedCard } from '../../../shared/contracts/knowledge-cards';
import { readReviewedCardsSettings } from './reviewed-cards.settings';

/**
 * CC-408 — portão de relevância: decide, para cada cartão que a busca
 * semântica achou, se ele se aplica ao caso. A busca só diz "parecido"; um
 * cartão de outro cenário com dose liberada é exatamente o erro que motivou o
 * plano de confiabilidade (dengue conduzida como sepse).
 *
 * Ponto de extensão da CC-407: o Jev (TypeSafe) ou um reranker entram como
 * outra implementação de `CardRelevanceGate`, pelo token
 * `CARD_RELEVANCE_GATE`, sem mexer na busca nem na decisão. O portão recebe
 * só o que a Etapa 1 entendeu do caso — nunca o texto do caso.
 */

/** Um cartão achado pela busca, com a similaridade com a consulta mais próxima. */
export interface CardCandidate {
  card: ReviewedCard;
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

export interface CardRelevanceGate {
  /** Vai para o log e para a trilha técnica da análise. */
  readonly name: string;
  /** Um veredito por candidato, na mesma ordem. Lançar = nenhum cartão nesta análise. */
  judge(
    candidates: readonly CardCandidate[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceVerdict[]>;
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
 * Portão provisório (até a CC-407): similaridade mínima e tema.
 *
 * 1. Similaridade abaixo do mínimo: não se aplica.
 * 2. Cartão e caso com síndrome definida: só a mesma síndrome se aplica — o
 *    cartão de dor torácica não entra no caso de dispneia.
 * 3. Sem síndrome definida de um dos lados (cartão genérico, caso `outro`,
 *    pergunta rápida): o tema do cartão precisa estar nas hipóteses do caso.
 */
export function judgeBySimilarityAndTheme(
  candidate: CardCandidate,
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

/** Implementação de hoje do portão: `judgeBySimilarityAndTheme` com o limiar do ambiente. */
@Injectable()
export class SimilarityThemeGate implements CardRelevanceGate {
  readonly name = 'similarity-theme';

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async judge(
    candidates: readonly CardCandidate[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceVerdict[]> {
    const { minSimilarity } = readReviewedCardsSettings(this.config);
    return candidates.map((candidate) =>
      judgeBySimilarityAndTheme(candidate, context, minSimilarity),
    );
  }
}

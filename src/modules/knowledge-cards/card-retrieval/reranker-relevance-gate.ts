import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { gateCard, gateCardText, gateSituation, gateSituationText } from './card-gate-input';
import type {
  CardCandidate,
  CardGateScores,
  CardRelevanceContext,
  CardRelevanceJudgement,
  RelevanceCard,
  ScoredCardRelevanceGate,
} from './card-relevance-gate';
import { readCardRerankerSettings } from './card-relevance-gate.settings';
import { CARD_RERANKER, type CardReranker } from './card-reranker';

export const RERANKER_GATE_NAME = 'reranker';

/**
 * CC-407 — portão do reranker: a situação (entendimento mascarado) como
 * consulta e cada candidato como documento, numa chamada só; o cartão entra
 * com escore ≥ `CARD_GATE_RERANKER_MIN_SCORE`. O fornecedor fica atrás de
 * `CardReranker` (hoje o cross-encoder local do TEI).
 *
 * Lança sem serviço, com o serviço fora ou com resposta fora do contrato:
 * quem escolhe o portão (`ConfiguredRelevanceGate`) cai no por limiar.
 */
@Injectable()
export class RerankerRelevanceGate implements ScoredCardRelevanceGate {
  readonly name = RERANKER_GATE_NAME;
  private readonly logger = new Logger(RerankerRelevanceGate.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CARD_RERANKER) private readonly reranker: CardReranker,
  ) {}

  get usdPerMillionInputTokens(): number {
    return this.reranker.usdPerMillionInputTokens;
  }

  configured(): boolean {
    return this.reranker.configured();
  }

  /** ≈ 3 caracteres por token; a consulta conta uma vez por documento, como num cross-encoder. */
  estimateInputTokens(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): number {
    const query = gateSituationText(gateSituation(context)).length;
    return candidates.reduce(
      (sum, { card }) => sum + Math.ceil((query + gateCardText(gateCard(card)).length) / 3),
      0,
    );
  }

  async score(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardGateScores> {
    const result = await this.reranker.rerank(
      gateSituationText(gateSituation(context)),
      candidates.map(({ card }) => gateCardText(gateCard(card))),
    );
    if (result.scores.length !== candidates.length) {
      throw new Error(`reranker devolveu ${result.scores.length} de ${candidates.length} escores`);
    }
    return result;
  }

  async judge(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceJudgement> {
    if (candidates.length === 0) return { gate: this.name, fallback: null, verdicts: [] };
    const run = await this.score(candidates, context);
    const { minScore } = readCardRerankerSettings(this.config);
    const verdicts = candidates.map(({ card }, index) => {
      const score = run.scores[index]!;
      const applies = score >= minScore;
      return {
        cardId: card.cardId,
        applies,
        reason: applies ? ('applies' as const) : ('gate_rejected' as const),
        score,
      };
    });
    this.logger.log(
      `CARD_GATE_RERANKER model=${run.model} candidates=${candidates.length} ` +
        `accepted=${verdicts.filter((verdict) => verdict.applies).length} ` +
        `minScore=${minScore} latencyMs=${run.latencyMs}`,
    );
    return { gate: this.name, fallback: null, verdicts };
  }
}

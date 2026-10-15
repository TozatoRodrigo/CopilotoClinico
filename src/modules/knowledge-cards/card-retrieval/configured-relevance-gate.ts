import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JevRequestError } from '../../jev/jev-client';
import {
  SimilarityThemeGate,
  type CardCandidate,
  type CardGateFallbackReason,
  type CardRelevanceContext,
  type CardRelevanceGate,
  type CardRelevanceJudgement,
  type RelevanceCard,
  type ScoredCardRelevanceGate,
} from './card-relevance-gate';
import { readCardGateKind, type CardGateKind } from './card-relevance-gate.settings';
import { CardRerankerRequestError } from './card-reranker';
import { JevRelevanceGate } from './jev-relevance-gate';
import { RerankerRelevanceGate } from './reranker-relevance-gate';

/** Sem a mensagem de erro de fora: a resposta de uma API pode ecoar o texto enviado. */
function safeErrorReason(error: unknown): string {
  if (error instanceof JevRequestError || error instanceof CardRerankerRequestError) {
    return error.message;
  }
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * CC-407 — o portão que a busca de cartões recebe (`CARD_RELEVANCE_GATE`):
 * escolhe, a cada análise, o por limiar, o Jev ou o reranker
 * (`CARD_RELEVANCE_GATE`, padrão `threshold`). Com o Jev ou o reranker sem
 * chave/serviço, ou fora do ar, decide o por limiar — a análise nunca fica
 * sem portão por causa de um provedor — e o `CARD_GATE_FALLBACK` vai para o
 * log (e a falha, para o Sentry). A trilha da análise guarda o motivo.
 */
@Injectable()
export class ConfiguredRelevanceGate implements CardRelevanceGate {
  private readonly logger = new Logger(ConfiguredRelevanceGate.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SimilarityThemeGate) private readonly threshold: SimilarityThemeGate,
    @Inject(JevRelevanceGate) private readonly jev: JevRelevanceGate,
    @Inject(RerankerRelevanceGate) private readonly reranker: RerankerRelevanceGate,
  ) {}

  /** O portão configurado agora: o da trilha quando nenhum chegou a julgar. */
  get name(): string {
    return this.selected(readCardGateKind(this.config)).name;
  }

  async judge(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceJudgement> {
    const kind = readCardGateKind(this.config);
    if (kind === 'threshold') return this.threshold.judge(candidates, context);

    const gate = this.selected(kind);
    if (!gate.configured()) {
      this.logger.warn(`CARD_GATE_FALLBACK gate=${kind} reason=unconfigured: decide o por limiar`);
      return this.fallback(`${kind}_unconfigured`, candidates, context);
    }
    try {
      return await gate.judge(candidates, context);
    } catch (error) {
      const reason = safeErrorReason(error);
      this.logger.error(`CARD_GATE_FALLBACK gate=${kind} reason=failed error=${reason}`);
      Sentry.captureMessage(
        `CARD_GATE_FALLBACK gate=${kind} reason=failed error=${reason}`,
        'error',
      );
      return this.fallback(`${kind}_failed`, candidates, context);
    }
  }

  private selected(kind: Exclude<CardGateKind, 'threshold'>): ScoredCardRelevanceGate;
  private selected(kind: CardGateKind): CardRelevanceGate;
  private selected(kind: CardGateKind): CardRelevanceGate {
    if (kind === 'jev') return this.jev;
    if (kind === 'reranker') return this.reranker;
    return this.threshold;
  }

  private async fallback(
    reason: CardGateFallbackReason,
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceJudgement> {
    const judgement = await this.threshold.judge(candidates, context);
    return { ...judgement, fallback: reason };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JEV_FETCH, JevClient, type JevNoulQuestion, type JevState } from '../../jev/jev-client';
import { JEV_USD_PER_MILLION_INPUT_TOKENS, readJevConnection } from '../../jev/jev.settings';
import { gateCard, gateSituation, type GateCard, type GateSituation } from './card-gate-input';
import type {
  CardCandidate,
  CardGateScores,
  CardRelevanceContext,
  CardRelevanceJudgement,
  RelevanceCard,
  ScoredCardRelevanceGate,
} from './card-relevance-gate';
import { readJevGateMinProbability } from './card-relevance-gate.settings';

export const JEV_GATE_NAME = 'jev';
const QUESTION_ID = 'card_applies';
/** Chamadas simultâneas por análise: a busca pode trazer dezenas de candidatos. */
const MAX_PARALLEL_CALLS = 4;

/**
 * A pergunta Noul (sim/não) da CC-407. Os textos vão para o modelo — mudar
 * aqui muda a probabilidade, e o limiar precisa ser recalibrado no bake-off.
 */
export const JEV_CARD_GATE_QUESTION: JevNoulQuestion = {
  type: 'noul',
  instructions:
    'Um copiloto de pronto-socorro só pode usar um cartão clínico revisado por médicos (`cartao`) quando ele ' +
    'se aplica à situação do paciente (`situacao`: síndrome, hipóteses e o entendimento do caso). ' +
    'Este cartão se aplica a esta situação?',
  criteria: {
    true:
      'O cartão trata do mesmo cenário clínico da situação — a mesma doença ou apresentação, numa população ' +
      'compatível — e a conduta dele serve para este paciente agora.',
    false:
      'O cartão é de outro cenário: outra doença, outra apresentação, outra população, ou só parecido ' +
      '(dengue × sepse, cefaleia em salvas × hemorragia). Usar a conduta dele aqui conduziria o caso errado.',
  },
};

/** O `state` de uma chamada: um par (situação, cartão), sem nada do caso além do entendimento. */
export function jevCardGateState(situation: GateSituation, card: GateCard): JevState {
  return { situacao: situation, cartao: card };
}

/**
 * CC-407 — portão do Jev (TypeSafe): uma pergunta Noul "este cartão se aplica
 * a esta situação?" por candidato, com a probabilidade calibrada de "sim".
 * O cartão entra com probabilidade ≥ `CARD_GATE_JEV_MIN_PROBABILITY`.
 *
 * Uma chamada por par, até `MAX_PARALLEL_CALLS` ao mesmo tempo: o julgamento
 * de um cartão não depende dos outros candidatos, como nos pares rotulados
 * do bake-off. Lança sem chave, com a API fora ou com resposta fora do
 * contrato — e uma falha descarta o lote inteiro: quem escolhe o portão
 * (`ConfiguredRelevanceGate`) cai no por limiar para todos os candidatos.
 */
@Injectable()
export class JevRelevanceGate implements ScoredCardRelevanceGate {
  readonly name = JEV_GATE_NAME;
  private readonly logger = new Logger(JevRelevanceGate.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JEV_FETCH) private readonly fetchImpl: typeof fetch,
  ) {}

  readonly usdPerMillionInputTokens = JEV_USD_PER_MILLION_INPUT_TOKENS;

  configured(): boolean {
    return readJevConnection(this.config).apiKey !== null;
  }

  /** ≈ 3 caracteres por token, para o lado de cima: o `state` e a pergunta de cada par. */
  estimateInputTokens(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): number {
    const situation = gateSituation(context);
    const question = JSON.stringify(JEV_CARD_GATE_QUESTION).length;
    return candidates.reduce(
      (sum, { card }) =>
        sum +
        Math.ceil(
          (JSON.stringify(jevCardGateState(situation, gateCard(card))).length + question) / 3,
        ),
      0,
    );
  }

  async score(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardGateScores> {
    const connection = readJevConnection(this.config);
    if (!connection.apiKey) throw new Error('JEV_API_KEY ausente');
    const client = new JevClient({
      ...connection,
      apiKey: connection.apiKey,
      fetch: this.fetchImpl,
    });
    const situation = gateSituation(context);

    const startedAt = Date.now();
    const results = [];
    for (let start = 0; start < candidates.length; start += MAX_PARALLEL_CALLS) {
      const batch = candidates.slice(start, start + MAX_PARALLEL_CALLS);
      results.push(
        ...(await Promise.all(
          batch.map(({ card }) =>
            client.noul(
              jevCardGateState(situation, gateCard(card)),
              QUESTION_ID,
              JEV_CARD_GATE_QUESTION,
            ),
          ),
        )),
      );
    }

    const tokens = results.map((result) => result.inputTokens);
    return {
      scores: results.map((result) => result.probability),
      model: results[0]?.model ?? connection.model,
      inputTokens: tokens.every((count) => count !== null)
        ? tokens.reduce<number>((sum, count) => sum + (count ?? 0), 0)
        : null,
      latencyMs: Date.now() - startedAt,
    };
  }

  async judge(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<CardRelevanceJudgement> {
    if (candidates.length === 0) return { gate: this.name, fallback: null, verdicts: [] };
    const run = await this.score(candidates, context);
    const minProbability = readJevGateMinProbability(this.config);
    const verdicts = candidates.map(({ card }, index) => {
      const probability = run.scores[index]!;
      const applies = probability >= minProbability;
      return {
        cardId: card.cardId,
        applies,
        reason: applies ? ('applies' as const) : ('gate_rejected' as const),
        score: probability,
      };
    });
    // Sem texto: ids saem no REVIEWED_CARDS; aqui, contagens, modelo e custo.
    this.logger.log(
      `CARD_GATE_JEV model=${run.model} candidates=${candidates.length} ` +
        `accepted=${verdicts.filter((verdict) => verdict.applies).length} ` +
        `minProbability=${minProbability} inputTokens=${run.inputTokens ?? '-'} latencyMs=${run.latencyMs}`,
    );
    return { gate: this.name, fallback: null, verdicts };
  }
}

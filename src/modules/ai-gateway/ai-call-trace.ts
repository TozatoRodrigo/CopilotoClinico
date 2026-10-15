import type { AiEffort, CompletionUsage } from './providers/provider.interface';
import type { AiCallOutcome, AiCallStage } from '../../shared/contracts/ai-calls';

// As listas vivem no contrato porque o painel do console (CC-004) também as usa.
export { AI_CALL_STAGES } from '../../shared/contracts/ai-calls';
export type { AiCallOutcome, AiCallStage } from '../../shared/contracts/ai-calls';

/**
 * Sufixo de `errorType` quando o provedor recusa por limite de uso ou falta de
 * crédito (ex.: "workspace API usage limits" da Anthropic, 11 e 14/10/2026).
 * A análise para até alguém agir, por isso o alerta (CC-005) procura por ele.
 */
export const USAGE_LIMIT_ERROR_SUFFIX = ':usage_limit';

/**
 * Mensagens com que os provedores dizem "acabou a cota": a Anthropic responde
 * 400 (não 429) ao limite do workspace, e a OpenAI 429 `insufficient_quota`.
 * Só a classificação vai para o rastro; a mensagem nunca.
 */
const USAGE_LIMIT_MESSAGE = /usage limits?|credit balance is too low|exceeded your current quota/i;

export function isUsageLimitMessage(message: string): boolean {
  return USAGE_LIMIT_MESSAGE.test(message);
}

/**
 * Uma chamada ao modelo, só com metadados: nenhum texto do caso, do prompt ou
 * da resposta. `promptSha256` é a impressão digital do system prompt e
 * identifica a versão do prompt que decidiu.
 */
export interface AiCallTrace {
  stage: AiCallStage;
  profile: string;
  provider: string;
  requestedModel: string;
  servedModel: string | null;
  effort: AiEffort | null;
  promptSha256: string;
  responseSchema: string | null;
  usage: CompletionUsage | null;
  latencyMs: number;
  outcome: AiCallOutcome;
  /**
   * Classe do erro e status HTTP (ex.: `RateLimitError:429`), nunca a
   * mensagem; termina em `USAGE_LIMIT_ERROR_SUFFIX` quando acabou a cota.
   */
  errorType: string | null;
}

export const AI_CALL_SINK = Symbol('AI_CALL_SINK');

/** Quem guarda o rastro. Não pode lançar nem atrasar a análise. */
export interface AiCallSink {
  record(trace: AiCallTrace): void;
}

import type { CompletionUsage } from './providers/provider.interface';

interface AiRefusalDetails {
  model: string;
  /** Categoria da política que recusou (`cyber`, `bio`, ...); `null` quando o provider não informa. */
  category: string | null;
  explanation: string | null;
  usage: CompletionUsage;
}

/**
 * O modelo declinou o pedido por política (Claude: `stop_reason: "refusal"`;
 * OpenAI: `refusal`/`content_filter`). A resposta não segue o schema esperado,
 * então quem chama decide entre degradar, avisar o médico ou tentar de novo.
 */
export class AiRefusalError extends Error {
  override readonly name = 'AiRefusalError';

  constructor(readonly details: AiRefusalDetails) {
    super(
      `Model ${details.model} refused the request (category: ${details.category ?? 'unspecified'}). ` +
        'Review the input or route the request to another model.',
    );
  }
}

interface AiTruncatedDetails {
  model: string;
  maxTokens: number;
  usage: CompletionUsage;
}

/**
 * A resposta bateu no limite de tokens de saída. Nos modelos com raciocínio,
 * o pensamento conta para esse limite: a saída visível fica incompleta (JSON
 * inválido) mesmo quando o texto final seria curto.
 */
export class AiTruncatedError extends Error {
  override readonly name = 'AiTruncatedError';

  constructor(readonly details: AiTruncatedDetails) {
    super(
      `Model ${details.model} hit the output token limit (${details.maxTokens}). ` +
        'Raise AI_MAX_OUTPUT_TOKENS or lower the effort.',
    );
  }
}

interface AiCapabilityUnsupportedDetails {
  provider: string;
  capability: 'web_research';
}

/**
 * F1 — o provider configurado não tem a capacidade pedida (ex.: pesquisa web
 * fora da Anthropic). Quem chama degrada: a análise segue sem a etapa.
 */
export class AiCapabilityUnsupportedError extends Error {
  override readonly name = 'AiCapabilityUnsupportedError';

  constructor(readonly details: AiCapabilityUnsupportedDetails) {
    super(
      `Provider ${details.provider} does not support ${details.capability}. ` +
        'Use AI_PROVIDER=anthropic.',
    );
  }
}

/**
 * Por que o provedor não atendeu, quando a falha é dele e não do pedido:
 * prazo estourado, rede, 429, 5xx ou limite de uso da conta. Só estes motivos
 * acionam o modelo de reserva (provider-fallback.ts).
 */
export const AI_UNAVAILABILITY_REASONS = [
  'timeout',
  'network',
  'rate_limit',
  'server_error',
  'usage_limit',
] as const;
export type AiUnavailabilityReason = (typeof AI_UNAVAILABILITY_REASONS)[number];

interface AiProviderErrorDetails {
  /** Status HTTP da última resposta; `null` quando nem houve resposta (prazo ou rede). */
  status: number | null;
  /** `null` quando o erro é do pedido (400 de schema, 401 de chave, 404 de modelo...). */
  unavailability: AiUnavailabilityReason | null;
}

/**
 * Falha definitiva do provedor compatível com a OpenAI, já depois das novas
 * tentativas. A mensagem nunca traz o corpo do host, que pode repetir o caso.
 */
export class AiProviderError extends Error {
  override readonly name = 'AiProviderError';

  constructor(
    message: string,
    readonly details: AiProviderErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * Classe do erro e status HTTP (ou motivo, sem status), nunca a mensagem:
 * vai para o rastro e para o log, e a mensagem de alguns hosts repete a entrada.
 */
export function errorTypeOf(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  if (error instanceof AiProviderError) {
    return `${error.name}:${error.details.status ?? error.details.unavailability ?? '-'}`;
  }
  // Os erros do SDK da Anthropic não definem `name`: a classe diz mais que "Error".
  const name = error.name === 'Error' ? error.constructor.name : error.name;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? `${name}:${status}` : name;
}

/**
 * `EMBEDDING_PROVIDER=none`: o serviço roda sem embeddings (a Anthropic não
 * tem API de embedding, e a conta da OpenAI ficou sem crédito em 10/2026).
 * Quem chama segue sem o vetor: a busca vira textual e o trecho é gravado
 * sem embedding, para preencher depois se um provedor voltar.
 */
export class AiEmbeddingsDisabledError extends Error {
  override readonly name = 'AiEmbeddingsDisabledError';

  constructor() {
    super('Embeddings desligados (EMBEDDING_PROVIDER=none)');
  }
}

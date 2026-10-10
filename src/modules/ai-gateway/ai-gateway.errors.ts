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

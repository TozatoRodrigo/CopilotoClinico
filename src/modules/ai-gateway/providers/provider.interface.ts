export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const AI_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

/**
 * JSON Schema da resposta. O provider só o envia quando o modelo suporta
 * structured outputs; nos demais, a saída continua sendo validada só pelo zod.
 */
export interface JsonResponseSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface CompletionParams {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Ignorado nos modelos que rejeitam sampling (Claude 4.6+/5.x e família de raciocínio da OpenAI). */
  temperature?: number;
  /** Profundidade de raciocínio nos modelos Claude atuais; sem efeito nos demais. */
  effort?: AiEffort;
  responseSchema?: JsonResponseSchema;
}

/**
 * `promptTokens` conta TODA a entrada, inclusive o que veio do cache, para o
 * total ser comparável entre providers. `cacheReadTokens` e `cacheWriteTokens`
 * são subconjuntos de `promptTokens`, cobrados a preços próprios.
 */
export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage: CompletionUsage;
  latencyMs: number;
}

/**
 * Valor de retorno do gerador de `completeStream`. `content` é o texto
 * autoritativo: depois de um fallback de recusa no meio do stream, os deltas
 * já emitidos incluem o trecho parcial do modelo que recusou, mas `content`
 * só traz o texto do modelo que respondeu.
 */
export interface StreamCompletionResult {
  content: string;
  model: string;
  usage: CompletionUsage;
  stopReason: string | null;
}

export interface EmbeddingParams {
  model: string;
  texts: string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface ProviderOverrides {
  apiKey?: string;
  baseUrl?: string;
}

export interface AIProvider {
  complete(params: CompletionParams): Promise<CompletionResponse>;
  completeStream(params: CompletionParams): AsyncGenerator<string, StreamCompletionResult>;
  embed(params: EmbeddingParams): Promise<EmbeddingResponse>;
  readonly name: string;
}

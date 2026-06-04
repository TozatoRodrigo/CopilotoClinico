export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionParams {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseSchema?: Record<string, unknown>;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
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

export interface AIProvider {
  complete(params: CompletionParams): Promise<CompletionResponse>;
  embed(params: EmbeddingParams): Promise<EmbeddingResponse>;
  readonly name: string;
}

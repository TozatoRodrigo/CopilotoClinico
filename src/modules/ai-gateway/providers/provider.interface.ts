import type { MaxTokensParam, StructuredOutputMode } from '../provider-profiles';

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
  /**
   * F1 — buscas feitas pela ferramenta de servidor `web_search`, cobradas à
   * parte dos tokens (US$ 10 por 1.000). Só a pesquisa web as faz.
   */
  webSearchRequests?: number;
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

/**
 * F1 — pesquisa com as ferramentas de servidor da Anthropic (web search e web
 * fetch), restrita a uma lista de domínios. A busca roda nos servidores da
 * Anthropic; a resposta é texto com citações das páginas lidas.
 */
export interface ResearchParams {
  model: string;
  system: string;
  /** Mensagem do usuário: só o que a diretriz responde, nunca dado do paciente. */
  prompt: string;
  effort?: AiEffort;
  maxTokens?: number;
  /** Hosts permitidos nas duas ferramentas; cada um cobre os seus subdomínios. */
  allowedDomains: readonly string[];
  maxSearches: number;
  maxFetches: number;
  /** Teto de tokens do texto de cada página lida (não vale para PDF). */
  maxFetchContentTokens: number;
}

/** Trecho citado na resposta da pesquisa, já com a URL da página de onde veio. */
export interface ResearchCitation {
  url: string;
  title: string | null;
  citedText: string;
}

export interface ResearchResponse {
  text: string;
  citations: ResearchCitation[];
  model: string;
  /** Soma das chamadas (turno inicial + retomadas), com `webSearchRequests`. */
  usage: CompletionUsage;
  latencyMs: number;
  /** Retomadas depois de `pause_turn`. */
  continuations: number;
  /** `pause_turn` quando o teto de retomadas acabou antes do fim do turno. */
  stopReason: string | null;
}

export interface ProviderOverrides {
  apiKey?: string;
  baseUrl?: string;
  /** Só o provedor compatível com a OpenAI usa os campos abaixo (ver provider-profiles.ts). */
  structuredOutput?: StructuredOutputMode;
  maxTokensParam?: MaxTokensParam;
  extraBody?: Record<string, unknown>;
}

export interface AIProvider {
  complete(params: CompletionParams): Promise<CompletionResponse>;
  completeStream(params: CompletionParams): AsyncGenerator<string, StreamCompletionResult>;
  embed(params: EmbeddingParams): Promise<EmbeddingResponse>;
  /** F1 — só a Anthropic implementa; os demais lançam `AiCapabilityUnsupportedError`. */
  research(params: ResearchParams): Promise<ResearchResponse>;
  readonly name: string;
}

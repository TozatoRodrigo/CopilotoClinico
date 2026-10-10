import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { JudgeClient, JudgeProvider, JudgeRequest, JudgeResponse } from './judge';

/**
 * F0-A — Transportes do juiz.
 *
 * Dois provedores porque o bake-off compara modelos Claude: julgar um Claude
 * com outro Claude favorece a família ("self-preference"). Com
 * `--judge openai` o juiz é de outra família.
 *
 * Sem retry aqui (`maxRetries: 0`): quem repete é o grading, que conta as
 * tentativas e as grava junto da nota.
 */

export const JUDGE_MAX_OUTPUT_TOKENS = 16_000;

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];

/**
 * Sem fallback de modelo em recusa (`fallbacks`), de propósito: a nota de
 * um caso não pode ser dada por outro modelo sem ninguém saber. Recusa vira
 * erro do juiz, visível no relatório.
 */
export class AnthropicJudgeClient implements JudgeClient {
  readonly provider = 'anthropic';

  constructor(
    readonly model: string,
    private readonly effort: Effort,
    private readonly client: Anthropic,
  ) {}

  async complete(request: JudgeRequest): Promise<JudgeResponse> {
    // Opus 5.5 recusa `temperature` e `budget_tokens`: o controle é o effort.
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: JUDGE_MAX_OUTPUT_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: this.effort,
        format: { type: 'json_schema', schema: request.schema },
      },
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
    });

    const content = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return {
      content,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: response.stop_reason,
    };
  }
}

export class JudgeHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const OpenAiChatResponseSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
          refusal: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }),
});

/**
 * Via fetch, como o provedor OpenAI do próprio pipeline — sem nova
 * dependência. Não manda `temperature`: os modelos de raciocínio da OpenAI
 * recusam o parâmetro.
 */
export class OpenAiJudgeClient implements JudgeClient {
  readonly provider = 'openai';

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async complete(request: JudgeRequest): Promise<JudgeResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: JUDGE_MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: request.schemaName, strict: true, schema: request.schema },
        },
      }),
    });

    if (!response.ok) {
      throw new JudgeHttpError(response.status, `OpenAI respondeu ${response.status}`);
    }

    const data = OpenAiChatResponseSchema.parse(await response.json());
    const choice = data.choices[0];
    return {
      content: choice?.message.content ?? '',
      model: data.model,
      usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens },
      stopReason: choice?.message.refusal ? 'refusal' : (choice?.finish_reason ?? null),
    };
  }
}

export const DEFAULT_ANTHROPIC_JUDGE_MODEL = 'claude-opus-5-5';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class JudgeConfigError extends Error {}

function parseEffort(raw: string | undefined): Effort {
  if (!raw) return 'high';
  const effort = EFFORTS.find((candidate) => candidate === raw);
  if (!effort)
    throw new JudgeConfigError(`JUDGE_EFFORT inválido: ${raw} (use ${EFFORTS.join(', ')})`);
  return effort;
}

/**
 * Configuração só por ambiente, nunca no código:
 * - anthropic: JUDGE_MODEL (padrão claude-opus-5-5), JUDGE_EFFORT (padrão
 *   high) e a credencial padrão do SDK (ANTHROPIC_API_KEY ou perfil `ant`).
 * - openai: JUDGE_MODEL (obrigatório), JUDGE_OPENAI_API_KEY ou
 *   OPENAI_API_KEY, JUDGE_OPENAI_BASE_URL opcional.
 */
export function createJudgeClient(
  provider: JudgeProvider,
  env: NodeJS.ProcessEnv = process.env,
): JudgeClient {
  if (provider === 'anthropic') {
    return new AnthropicJudgeClient(
      env.JUDGE_MODEL || DEFAULT_ANTHROPIC_JUDGE_MODEL,
      parseEffort(env.JUDGE_EFFORT),
      new Anthropic({ maxRetries: 0, timeout: 10 * 60 * 1000 }),
    );
  }

  const model = env.JUDGE_MODEL;
  if (!model)
    throw new JudgeConfigError(
      '--judge openai exige JUDGE_MODEL (ex.: o modelo de raciocínio em uso).',
    );
  const apiKey = env.JUDGE_OPENAI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey)
    throw new JudgeConfigError('--judge openai exige JUDGE_OPENAI_API_KEY ou OPENAI_API_KEY.');
  return new OpenAiJudgeClient(model, apiKey, env.JUDGE_OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL);
}

const NETWORK_ERROR_MESSAGES = new Set(['fetch failed']);

/** Vale repetir: rate limit, 5xx/overloaded e falha de rede. 4xx não. */
export function isTransientJudgeError(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.InternalServerError) return true;
  if (error instanceof JudgeHttpError) return error.status === 429 || error.status >= 500;
  return error instanceof TypeError && NETWORK_ERROR_MESSAGES.has(error.message);
}

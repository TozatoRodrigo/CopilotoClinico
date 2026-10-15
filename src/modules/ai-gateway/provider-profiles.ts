import type { ConfigService } from '@nestjs/config';
import { readOptionalChoice, readSetting } from './ai-gateway.settings';

/**
 * Perfis de provedor: além do provedor padrão (`AI_PROVIDER`), o gateway fala
 * com os provedores nomeados em `AI_PROVIDER_PROFILES`. Cada etapa escolhe o
 * seu pela referência do modelo: `groq:openai/gpt-oss-120b` vai para o perfil
 * `groq` com o modelo `openai/gpt-oss-120b`; sem prefixo de perfil conhecido,
 * a referência inteira é o modelo do provedor padrão.
 */
export const DEFAULT_PROFILE = 'default';

export const PROVIDER_KINDS = ['anthropic', 'openai', 'test'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * Como pedir JSON a um host compatível com a OpenAI: `json_schema` (estrito),
 * `json_object` (só JSON válido, sem schema) ou `off` (só o prompt). O zod
 * valida a saída em todos os casos.
 */
export const STRUCTURED_OUTPUT_MODES = ['json_schema', 'json_object', 'off'] as const;
export type StructuredOutputMode = (typeof STRUCTURED_OUTPUT_MODES)[number];

/** A OpenAI exige `max_completion_tokens`; parte dos hosts compatíveis só aceita `max_tokens`. */
export const MAX_TOKENS_PARAMS = ['max_completion_tokens', 'max_tokens'] as const;
export type MaxTokensParam = (typeof MAX_TOKENS_PARAMS)[number];

export interface ProviderProfile {
  name: string;
  kind: ProviderKind;
  apiKey: string;
  baseUrl?: string;
  /** Só no tipo `openai`. Ausente: o provedor usa o padrão dele. */
  structuredOutput?: StructuredOutputMode;
  maxTokensParam?: MaxTokensParam;
  /** Campos próprios do host (ex.: `{"reasoning_format":"hidden"}`), somados ao corpo da requisição. */
  extraBody?: Record<string, unknown>;
}

export interface ModelRef {
  profile: string;
  model: string;
}

const PROFILE_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * Lê os perfis nomeados. Configuração inválida derruba a inicialização: um
 * perfil sem chave ou com tipo errado mandaria a análise para o lugar errado.
 */
export function readProviderProfiles(config: ConfigService): ProviderProfile[] {
  const names = (readSetting(config, 'AI_PROVIDER_PROFILES') ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');

  return [...new Set(names)].map((name) => readProfile(config, name));
}

function readProfile(config: ConfigService, name: string): ProviderProfile {
  if (!PROFILE_NAME.test(name) || name === DEFAULT_PROFILE) {
    throw new Error(
      `AI_PROVIDER_PROFILES has an invalid profile name "${name}". ` +
        `Use lowercase letters, digits and "_", starting with a letter, and never "${DEFAULT_PROFILE}".`,
    );
  }
  const prefix = `AI_PROVIDER_${name.toUpperCase()}_`;
  const kind = readOptionalChoice(config, `${prefix}KIND`, PROVIDER_KINDS);
  if (!kind) throw new Error(`${prefix}KIND is required for the "${name}" provider profile.`);
  const apiKey = readSetting(config, `${prefix}API_KEY`);
  if (!apiKey) throw new Error(`${prefix}API_KEY is required for the "${name}" provider profile.`);

  return {
    name,
    kind,
    apiKey,
    baseUrl: readSetting(config, `${prefix}BASE_URL`),
    structuredOutput: readOptionalChoice(
      config,
      `${prefix}STRUCTURED_OUTPUT`,
      STRUCTURED_OUTPUT_MODES,
    ),
    maxTokensParam: readOptionalChoice(config, `${prefix}MAX_TOKENS_PARAM`, MAX_TOKENS_PARAMS),
    extraBody: readExtraBody(config, `${prefix}EXTRA_BODY`),
  };
}

function readExtraBody(config: ConfigService, key: string): Record<string, unknown> | undefined {
  const raw = readSetting(config, key);
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${key} must be a JSON object.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Só um prefixo que nomeia um perfil configurado conta como perfil: ids de
 * modelo com ":" (ex.: `llama3:8b` no Ollama) continuam sendo modelo.
 */
export function parseModelRef(ref: string, profileNames: ReadonlySet<string>): ModelRef {
  const separator = ref.indexOf(':');
  if (separator > 0) {
    const profile = ref.slice(0, separator).toLowerCase();
    if (profileNames.has(profile)) {
      return { profile, model: ref.slice(separator + 1) };
    }
  }
  return { profile: DEFAULT_PROFILE, model: ref };
}

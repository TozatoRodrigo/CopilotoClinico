/**
 * Capacidades por família de modelo Claude. Fonte: skill `claude-api`
 * (shared/model-migration.md, tool-use-concepts.md § Structured Outputs).
 * Modelos fora do padrão de nome (ex.: `claude-3-5-sonnet-latest`) caem no
 * perfil legado: sem thinking/effort, com temperature.
 */
export interface ClaudeCapabilities {
  /** Aceita `thinking: {type: "adaptive"}` + `output_config.effort` e rejeita temperature/top_p/top_k. */
  adaptiveThinking: boolean;
  structuredOutputs: boolean;
  /** Fallback server-side `fallbacks: "default"` em caso de recusa por política. */
  refusalFallback: boolean;
  /**
   * F1 — filtragem dinâmica das ferramentas web `_20260209` (o modelo filtra
   * o resultado em código antes de lê-lo). Sem ela, as mesmas ferramentas
   * exigem `allowed_callers: ["direct"]`. Fonte: skill `claude-api`, Server
   * Tools (Opus/Sonnet 4.6+, Fable, Mythos).
   */
  dynamicWebFiltering: boolean;
}

const CLAUDE_MODEL_ID = /claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/;

// Fable e Mythos nasceram na geração 5: todas as versões têm a superfície atual.
const ALWAYS_CURRENT_TIERS = new Set(['fable', 'mythos']);
const ADAPTIVE_THINKING_SINCE = 406;
const STRUCTURED_OUTPUTS_SINCE = 408;
const LEGACY_STRUCTURED_OUTPUT_MODELS = new Set(['haiku-405', 'opus-405', 'opus-401']);
const REFUSAL_FALLBACK_MODELS = new Set(['fable-501', 'opus-505', 'opus-500', 'sonnet-505']);
const DYNAMIC_WEB_FILTERING_TIERS = new Set(['opus', 'sonnet']);
const DYNAMIC_WEB_FILTERING_SINCE = 406;

const LEGACY_CAPABILITIES: ClaudeCapabilities = {
  adaptiveThinking: false,
  structuredOutputs: false,
  refusalFallback: false,
  dynamicWebFiltering: false,
};

export function claudeCapabilities(model: string): ClaudeCapabilities {
  const match = CLAUDE_MODEL_ID.exec(model);
  if (!match) return LEGACY_CAPABILITIES;

  const [, tier = '', major = '0', minor = '0'] = match;
  const version = Number(major) * 100 + Number(minor);
  const modelKey = `${tier}-${version}`;
  const isAlwaysCurrent = ALWAYS_CURRENT_TIERS.has(tier);

  return {
    adaptiveThinking: isAlwaysCurrent || version >= ADAPTIVE_THINKING_SINCE,
    structuredOutputs:
      isAlwaysCurrent ||
      version >= STRUCTURED_OUTPUTS_SINCE ||
      LEGACY_STRUCTURED_OUTPUT_MODELS.has(modelKey),
    refusalFallback: REFUSAL_FALLBACK_MODELS.has(modelKey),
    dynamicWebFiltering:
      isAlwaysCurrent ||
      (DYNAMIC_WEB_FILTERING_TIERS.has(tier) && version >= DYNAMIC_WEB_FILTERING_SINCE),
  };
}

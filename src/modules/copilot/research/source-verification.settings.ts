import type { ConfigService } from '@nestjs/config';
import type { AiEffort } from '../../ai-gateway/providers/provider.interface';

/**
 * Verificação com fonte depois da decisão (`COPILOT_KNOWLEDGE_SOURCE=verify`).
 * A pesquisa usa os mesmos settings da pesquisa web (web-research.settings.ts);
 * aqui fica só o que é próprio do vínculo entre conduta e trecho. Lido a cada
 * análise, sem redeploy.
 */

/** O vínculo só lê trechos curtos e devolve ids: um modelo intermediário basta. */
export const DEFAULT_VERIFY_ATTACH_MODEL = 'claude-sonnet-5-5';

/** Esforço fixo: vincular trecho a conduta não pede raciocínio longo, e a latência soma. */
export const VERIFY_ATTACH_EFFORT: AiEffort = 'low';

/**
 * Teto de condutas verificadas por análise: cada uma alonga a pesquisa (mais
 * buscas, mais páginas lidas). As primeiras da saída são as mais urgentes.
 */
export const MAX_VERIFIED_ACTIONS = 8;

/** `AI_VERIFY_ATTACH_MODEL`; ausente ou vazio usa o padrão. */
export function readVerifyAttachModel(config: ConfigService): string {
  const configured = config.get<string | undefined>('AI_VERIFY_ATTACH_MODEL')?.trim();
  return configured ? configured : DEFAULT_VERIFY_ATTACH_MODEL;
}

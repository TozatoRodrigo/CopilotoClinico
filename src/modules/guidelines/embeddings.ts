import * as Sentry from '@sentry/node';
import type { Logger } from '@nestjs/common';
import type { AiGatewayService } from '../ai-gateway/ai-gateway.service';

/**
 * Embeddings para diretrizes, ou `null` quando não há vetor — e a
 * funcionalidade segue sem ele.
 *
 * Em 11/10/2026 a conta da OpenAI (único provedor de embedding: a Anthropic
 * não tem essa API) ficou sem crédito, e "Consultar diretrizes", "Sugerir
 * diretriz" e a ingestão do curador passaram a responder 500. Sem vetor, a
 * consulta busca por palavra-chave e o trecho é gravado sem embedding (a busca
 * textual já o encontra; o vetor pode ser preenchido depois, se um provedor
 * voltar).
 *
 * - `EMBEDDING_PROVIDER=none`: desligado de propósito — nenhuma chamada,
 *   nenhum alerta.
 * - Provedor ligado que falha (sem crédito, fora do ar) ou devolve menos
 *   vetores: log de erro e Sentry, para ser corrigido.
 */
export async function embedOrNull(
  aiGateway: AiGatewayService,
  texts: readonly string[],
  context: { logger: Logger; label: string; batchSize?: number },
): Promise<number[][] | null> {
  if (!aiGateway.embeddingsEnabled() || texts.length === 0) return null;

  const batchSize = context.batchSize ?? texts.length;
  try {
    const embeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const response = await aiGateway.embed(texts.slice(start, start + batchSize));
      embeddings.push(...response.embeddings);
    }
    if (embeddings.length !== texts.length || embeddings.some((vector) => !vector?.length)) {
      throw new Error(`provedor devolveu ${embeddings.length} de ${texts.length} vetores`);
    }
    return embeddings;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    context.logger.error(`GUIDELINE_EMBEDDING_UNAVAILABLE ${context.label}: ${reason}`);
    Sentry.captureMessage(`GUIDELINE_EMBEDDING_UNAVAILABLE ${context.label}: ${reason}`, 'error');
    return null;
  }
}

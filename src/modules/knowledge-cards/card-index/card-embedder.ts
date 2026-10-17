import { Inject, Injectable } from '@nestjs/common';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';

/**
 * CC-406 — o que vira vetor: o cartão (`document`, na indexação) ou a
 * consulta (`query`, na busca). Provedores assimétricos tratam os dois de
 * jeito diferente — `input_type` da Voyage, instrução de consulta do
 * Qwen3-Embedding — e a qualidade da busca depende disso.
 */
export type EmbeddingPurpose = 'document' | 'query';

/** Quem gerou o vetor. Gravado em cada linha do índice: só vetores do mesmo modelo se comparam. */
export interface CardEmbedderIdentity {
  provider: string;
  model: string;
}

/**
 * CC-406 — provedor de embedding dos cartões, atrás de interface para a
 * escolha do provedor (OpenAI, Voyage, Qwen3, modelo local — ver a emenda de
 * 15/10/2026 à ADR-019) ser uma troca de implementação e um reindex, sem
 * mexer na indexação nem na busca.
 */
export interface CardEmbedder {
  /** `false` com `EMBEDDING_PROVIDER=none`: nenhuma chamada sai; o índice guarda a linha sem vetor. */
  enabled(): boolean;
  identity(): CardEmbedderIdentity;
  /**
   * Um vetor por texto, na ordem. Lança quando o provedor falha ou devolve
   * menos vetores: quem chama decide se segue sem vetor (e com que alerta).
   */
  embed(texts: readonly string[], purpose: EmbeddingPurpose): Promise<number[][]>;
}

export const CARD_EMBEDDER = Symbol('CARD_EMBEDDER');

/** Textos por chamada: folga para os limites de entrada de OpenAI (2048) e Voyage (1000). */
export const CARD_EMBEDDING_BATCH_SIZE = 64;

/**
 * Implementação de hoje: o mesmo provedor e modelo das diretrizes
 * (`EMBEDDING_PROVIDER`, `AI_EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`), pelo
 * gateway. A API compatível com OpenAI não distingue documento de consulta,
 * então `purpose` ainda não muda a chamada.
 */
@Injectable()
export class GatewayCardEmbedder implements CardEmbedder {
  constructor(@Inject(AiGatewayService) private readonly gateway: AiGatewayService) {}

  enabled(): boolean {
    return this.gateway.embeddingsEnabled();
  }

  identity(): CardEmbedderIdentity {
    return {
      provider: this.gateway.getEmbeddingProviderName(),
      model: this.gateway.getEmbeddingModel(),
    };
  }

  async embed(texts: readonly string[], _purpose: EmbeddingPurpose): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += CARD_EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + CARD_EMBEDDING_BATCH_SIZE);
      const response = await this.gateway.embed([...batch]);
      embeddings.push(...response.embeddings);
    }
    if (embeddings.length !== texts.length || embeddings.some((vector) => !vector?.length)) {
      throw new Error(`provedor devolveu ${embeddings.length} de ${texts.length} vetores`);
    }
    return embeddings;
  }
}

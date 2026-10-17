import { describe, expect, it, vi } from 'vitest';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { CARD_EMBEDDING_BATCH_SIZE, GatewayCardEmbedder } from './card-embedder';

function gatewayStub(dimensions = 3) {
  return {
    embeddingsEnabled: vi.fn().mockReturnValue(true),
    getEmbeddingProviderName: vi.fn().mockReturnValue('openai'),
    getEmbeddingModel: vi.fn().mockReturnValue('text-embedding-3-small'),
    embed: vi.fn(async (texts: string[]) => ({
      embeddings: texts.map(() => new Array<number>(dimensions).fill(0.5)),
      model: 'text-embedding-3-small',
      usage: { promptTokens: texts.length, totalTokens: texts.length },
    })),
  };
}

describe('GatewayCardEmbedder (CC-406)', () => {
  it('usa o provedor e o modelo de embedding do gateway', () => {
    const gateway = gatewayStub();
    const embedder = new GatewayCardEmbedder(gateway as unknown as AiGatewayService);

    expect(embedder.enabled()).toBe(true);
    expect(embedder.identity()).toEqual({ provider: 'openai', model: 'text-embedding-3-small' });

    gateway.embeddingsEnabled.mockReturnValue(false);
    expect(embedder.enabled()).toBe(false);
  });

  it('manda os textos em lotes e devolve um vetor por texto, na ordem', async () => {
    const gateway = gatewayStub();
    const embedder = new GatewayCardEmbedder(gateway as unknown as AiGatewayService);
    const texts = Array.from({ length: CARD_EMBEDDING_BATCH_SIZE + 1 }, (_, i) => `cartão ${i}`);

    const vectors = await embedder.embed(texts, 'document');

    expect(vectors).toHaveLength(texts.length);
    expect(gateway.embed).toHaveBeenCalledTimes(2);
    expect(gateway.embed.mock.calls[0]?.[0]).toHaveLength(CARD_EMBEDDING_BATCH_SIZE);
    expect(gateway.embed.mock.calls[1]?.[0]).toEqual([`cartão ${CARD_EMBEDDING_BATCH_SIZE}`]);
  });

  it('não chama o provedor sem texto', async () => {
    const gateway = gatewayStub();
    const embedder = new GatewayCardEmbedder(gateway as unknown as AiGatewayService);

    await expect(embedder.embed([], 'query')).resolves.toEqual([]);
    expect(gateway.embed).not.toHaveBeenCalled();
  });

  it('lança quando o provedor devolve menos vetores ou vetor vazio', async () => {
    const gateway = gatewayStub();
    gateway.embed.mockResolvedValueOnce({
      embeddings: [[0.1]],
      model: 'm',
      usage: { promptTokens: 2, totalTokens: 2 },
    });
    const embedder = new GatewayCardEmbedder(gateway as unknown as AiGatewayService);

    await expect(embedder.embed(['a', 'b'], 'query')).rejects.toThrow(
      'provedor devolveu 1 de 2 vetores',
    );

    gateway.embed.mockResolvedValueOnce({
      embeddings: [[]],
      model: 'm',
      usage: { promptTokens: 1, totalTokens: 1 },
    });
    await expect(embedder.embed(['a'], 'query')).rejects.toThrow('provedor devolveu 1 de 1');
  });
});

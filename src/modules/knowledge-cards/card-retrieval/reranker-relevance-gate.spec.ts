import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { anaphylaxisCard } from '../../../../tests/fixtures/quick-question';
import { reviewedCard } from '../../../../tests/fixtures/reviewed-cards';
import type { CardRelevanceContext } from './card-relevance-gate';
import { readCardRerankerSettings } from './card-relevance-gate.settings';
import { CardRerankerRequestError, TEI_RERANK_BATCH_SIZE, TeiCardReranker } from './card-reranker';
import { RerankerRelevanceGate } from './reranker-relevance-gate';

/**
 * CC-407 — o portão do reranker com o cross-encoder local do TEI
 * (text-embeddings-inference). Nenhum teste chama o serviço: `fetch` falso.
 */

const meningitisCase: CardRelevanceContext = {
  syndrome: 'febre',
  hypotheses: ['Meningite bacteriana'],
  problemRepresentation: 'Adulto com febre, cefaleia e rigidez de nuca há 12 horas',
};

function teiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TeiCardReranker (CC-407)', () => {
  let env: Record<string, string>;
  let fetchImpl: ReturnType<typeof vi.fn>;

  function reranker() {
    return new TeiCardReranker(new ConfigService(env), fetchImpl as unknown as typeof fetch);
  }

  beforeEach(() => {
    env = { CARD_RERANKER_URL: 'http://reranker:80/' };
    fetchImpl = vi.fn();
  });

  it('chama POST /rerank com escore normalizado e devolve na ordem dos documentos', async () => {
    // O TEI devolve ordenado por escore, não pela ordem pedida.
    fetchImpl.mockResolvedValue(
      teiResponse([
        { index: 1, score: 0.97 },
        { index: 0, score: 0.08 },
      ]),
    );

    const result = await reranker().rerank('situação', ['cartão a', 'cartão b']);

    expect(fetchImpl).toHaveBeenCalledWith('http://reranker:80/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'situação',
        texts: ['cartão a', 'cartão b'],
        raw_scores: false,
        truncate: true,
      }),
      signal: expect.any(AbortSignal),
    });
    expect(result).toMatchObject({
      scores: [0.08, 0.97],
      model: 'BAAI/bge-reranker-v2-m3',
      inputTokens: null,
    });
  });

  it('manda a chave no Bearer quando o serviço exige', async () => {
    env = { ...env, CARD_RERANKER_API_KEY: 'segredo' };
    fetchImpl.mockResolvedValue(teiResponse([{ index: 0, score: 0.5 }]));

    await reranker().rerank('q', ['d']);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer segredo',
    });
  });

  it('divide em lotes do tamanho que o TEI aceita', async () => {
    fetchImpl.mockImplementation(async (_url: string, init: RequestInit) => {
      const { texts } = JSON.parse(String(init.body)) as { texts: string[] };
      return teiResponse(texts.map((_text, index) => ({ index, score: 0.5 })));
    });

    const documents = Array.from({ length: TEI_RERANK_BATCH_SIZE + 3 }, (_v, i) => `d${i}`);
    const result = await reranker().rerank('q', documents);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.scores).toHaveLength(documents.length);
  });

  it.each([
    [
      'índice repetido',
      [
        { index: 0, score: 0.5 },
        { index: 0, score: 0.4 },
      ],
    ],
    ['faltou documento', [{ index: 0, score: 0.5 }]],
    [
      'índice fora da faixa',
      [
        { index: 0, score: 0.5 },
        { index: 7, score: 0.4 },
      ],
    ],
    [
      'escore cru (logit)',
      [
        { index: 0, score: 3.2 },
        { index: 1, score: -1 },
      ],
    ],
  ])('resposta fora do contrato é inválida: %s', async (_case, body) => {
    fetchImpl.mockResolvedValue(teiResponse(body));

    await expect(reranker().rerank('q', ['a', 'b'])).rejects.toThrow(
      'Reranker invalid_response 200',
    );
  });

  it('HTTP, rede e tempo esgotado viram CardRerankerRequestError sem o corpo', async () => {
    fetchImpl.mockResolvedValue(teiResponse({ error: 'eco' }, 503));
    await expect(reranker().rerank('q', ['a'])).rejects.toThrow('Reranker http 503');

    fetchImpl.mockRejectedValue(new TypeError('fetch failed'));
    await expect(reranker().rerank('q', ['a'])).rejects.toBeInstanceOf(CardRerankerRequestError);

    env = { ...env, CARD_RERANKER_TIMEOUT_MS: '100' };
    fetchImpl.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    await expect(reranker().rerank('q', ['a'])).rejects.toThrow('Reranker timeout');
  });

  it('sem URL (ou com URL inválida) não roda', async () => {
    for (const url of [undefined, '', 'reranker:80', 'ftp://reranker']) {
      env = url === undefined ? {} : { CARD_RERANKER_URL: url };
      expect(reranker().configured()).toBe(false);
    }
    await expect(reranker().rerank('q', ['a'])).rejects.toThrow('Reranker unconfigured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('readCardRerankerSettings', () => {
  it('usa os padrões com valor ausente ou inválido — um typo nunca afrouxa o portão', () => {
    expect(
      readCardRerankerSettings(
        new ConfigService({ CARD_GATE_RERANKER_MIN_SCORE: '0', CARD_RERANKER_TIMEOUT_MS: 'x' }),
      ),
    ).toEqual({
      url: null,
      apiKey: null,
      model: 'BAAI/bge-reranker-v2-m3',
      timeoutMs: 2000,
      minScore: 0.5,
    });
  });
});

describe('RerankerRelevanceGate (CC-407)', () => {
  let env: Record<string, string>;
  let fetchImpl: ReturnType<typeof vi.fn>;

  function gate() {
    const config = new ConfigService(env);
    return new RerankerRelevanceGate(
      config,
      new TeiCardReranker(config, fetchImpl as unknown as typeof fetch),
    );
  }

  beforeEach(() => {
    env = { CARD_RERANKER_URL: 'http://reranker:80' };
    fetchImpl = vi.fn().mockResolvedValue(
      teiResponse([
        { index: 0, score: 0.88 },
        { index: 1, score: 0.21 },
      ]),
    );
  });

  it('a situação é a consulta e cada cartão um documento, numa chamada só', async () => {
    const judgement = await gate().judge(
      [
        { card: reviewedCard(), similarity: 0.8 },
        { card: anaphylaxisCard(), similarity: 0.5 },
      ],
      meningitisCase,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.query).toBe(
      'Síndrome: febre\nHipóteses: Meningite bacteriana\n' +
        'Situação: Adulto com febre, cefaleia e rigidez de nuca há 12 horas',
    );
    expect(body.texts[0]).toContain('Tema: Meningite bacteriana');
    expect(body.texts[1]).toContain('Tema: Anafilaxia: adrenalina IM');
    expect(JSON.stringify(body)).not.toContain('Ana Souza');
    expect(judgement).toEqual({
      gate: 'reranker',
      fallback: null,
      verdicts: [
        { cardId: reviewedCard().cardId, applies: true, reason: 'applies', score: 0.88 },
        { cardId: anaphylaxisCard().cardId, applies: false, reason: 'gate_rejected', score: 0.21 },
      ],
    });
  });

  it('o limiar vem do ambiente', async () => {
    env = { ...env, CARD_GATE_RERANKER_MIN_SCORE: '0.2' };

    const { verdicts } = await gate().judge(
      [
        { card: reviewedCard(), similarity: 0.8 },
        { card: anaphylaxisCard(), similarity: 0.5 },
      ],
      meningitisCase,
    );

    expect(verdicts.map((verdict) => verdict.applies)).toEqual([true, true]);
  });

  it('serviço local: sem custo por token, e estimativa sem chamada', () => {
    expect(gate().usdPerMillionInputTokens).toBe(0);
    expect(
      gate().estimateInputTokens([{ card: reviewedCard(), similarity: 0.8 }], meningitisCase),
    ).toBeGreaterThan(50);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

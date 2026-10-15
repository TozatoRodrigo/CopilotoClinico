import { describe, expect, it, vi } from 'vitest';
import { jevChoiceBody, jevNoulBody, jevResponse } from '../../../tests/fixtures/jev';
import {
  JevClient,
  JevRequestError,
  type JevChoiceQuestion,
  type JevNoulQuestion,
} from './jev-client';

/**
 * O cliente do Jev (TypeSafe) da guarda de escopo (CC-503) e do portão de
 * relevância (CC-407). Nenhum teste chama a API: o `fetch` é falso e o
 * contrato é o da documentação pública (docs.typesafe.ai/api).
 */

function client(fetchImpl: ReturnType<typeof vi.fn>, timeoutMs = 1000) {
  return new JevClient({
    apiKey: 'chave-de-teste',
    baseUrl: 'https://jev.example',
    model: 'jev-latest',
    timeoutMs,
    fetch: fetchImpl as unknown as typeof fetch,
  });
}

describe('JevClient.choose', () => {
  const question: JevChoiceQuestion = {
    type: 'choice',
    instructions: 'Qual time cuida disto?',
    criteria: { billing: 'cobrança', technical: null },
  };

  it('manda state, model e a pergunta Choice com a chave no Bearer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse(jevChoiceBody('billing', 0.9, 'q1')));

    const result = await client(fetchImpl).choose('texto mascarado', 'q1', question);

    expect(fetchImpl).toHaveBeenCalledWith('https://jev.example/v1/systemone', {
      method: 'POST',
      headers: { Authorization: 'Bearer chave-de-teste', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'texto mascarado',
        model: 'jev-latest',
        questions: { q1: question },
      }),
      signal: expect.any(AbortSignal),
    });
    expect(result).toMatchObject({
      answer: { choice: 'billing', confidence: 0.9 },
      model: 'jev-1.13.0',
      inputTokens: 87,
    });
  });

  it.each([401, 422, 429, 529])('HTTP %i vira JevRequestError sem o corpo', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse({ error: 'eco da pergunta' }, status));

    const failure = client(fetchImpl).choose('x', 'q1', question);

    await expect(failure).rejects.toBeInstanceOf(JevRequestError);
    await expect(failure).rejects.toThrow(`Jev http ${status}`);
  });

  it('resposta fora do contrato ou com opção que não foi pedida é inválida', async () => {
    const unknownChoice = vi
      .fn()
      .mockResolvedValue(jevResponse(jevChoiceBody('constructor', 0.9, 'q1')));
    const missingAnswer = vi.fn().mockResolvedValue(jevResponse({ model: 'jev', answers: {} }));

    await expect(client(unknownChoice).choose('x', 'q1', question)).rejects.toThrow(
      'Jev invalid_response 200',
    );
    await expect(client(missingAnswer).choose('x', 'q1', question)).rejects.toThrow(
      'Jev invalid_response 200',
    );
  });

  it('estoura o tempo e aborta a chamada', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    await expect(client(fetchImpl, 10).choose('x', 'q1', question)).rejects.toThrow('Jev timeout');
  });

  it('erro de rede vira JevRequestError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(client(fetchImpl).choose('x', 'q1', question)).rejects.toThrow('Jev network');
  });
});

describe('JevClient.noul (CC-407)', () => {
  const question: JevNoulQuestion = {
    type: 'noul',
    instructions: 'O cartão se aplica?',
    criteria: { true: 'mesmo cenário', false: 'outro cenário' },
  };

  it('manda um state objeto e devolve a probabilidade de "sim"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse(jevNoulBody(0.93, 'q1', 140)));
    const state = { situacao: { hipoteses: ['Anafilaxia'] }, cartao: { tema: 'Anafilaxia' } };

    const result = await client(fetchImpl).noul(state, 'q1', question);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      state,
      model: 'jev-latest',
      questions: { q1: question },
    });
    expect(result).toMatchObject({ probability: 0.93, model: 'jev-1.13.0', inputTokens: 140 });
    expect(result.latencyMs).toEqual(expect.any(Number));
  });

  it('resposta de outro tipo, sem a pergunta ou fora de 0–1 é inválida', async () => {
    for (const body of [
      jevChoiceBody('sim', 0.9, 'q1'),
      jevNoulBody(0.9, 'outra'),
      jevNoulBody(1.2, 'q1'),
      { answers: { q1: { type: 'noul', noul: 0.5 } } },
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(jevResponse(body));
      await expect(client(fetchImpl).noul('x', 'q1', question)).rejects.toThrow(
        'Jev invalid_response 200',
      );
    }
  });

  it('sem usage, os tokens ficam desconhecidos', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jevResponse({ model: 'jev-1', answers: { q1: { type: 'noul', noul: 0 } } }),
      );

    await expect(client(fetchImpl).noul('x', 'q1', question)).resolves.toMatchObject({
      probability: 0,
      inputTokens: null,
    });
  });
});

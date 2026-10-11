import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiCapabilityUnsupportedError,
  AiRefusalError,
  AiTruncatedError,
} from '../../src/modules/ai-gateway/ai-gateway.errors';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { CompletionRecorder, RecordingAiGatewayService, type RecordedCompletion } from './recorder';

const usage = {
  promptTokens: 9_000,
  completionTokens: 16_000,
  totalTokens: 25_000,
  cacheReadTokens: 8_000,
};

function recordingGateway() {
  const recorder = new CompletionRecorder();
  const config = new ConfigService({
    AI_PROVIDER: 'test',
    AI_MODEL: 'claude-opus-5-5',
    AI_API_KEY: 'offline',
    AI_EMBEDDING_MODEL: 'test-embedding',
  });
  return { recorder, gateway: new RecordingAiGatewayService(config, recorder) };
}

const messages = [{ role: 'user' as const, content: 'caso' }];

describe('RecordingAiGatewayService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('grava a chamada normal com o modelo servido e o usage do provedor', async () => {
    const { recorder, gateway } = recordingGateway();
    const sink: RecordedCompletion[] = [];

    await recorder.run(sink, () => gateway.complete({ messages }));

    expect(sink).toEqual([
      expect.objectContaining({ requestedModel: 'claude-opus-5-5', stopReason: null, error: null }),
    ]);
    expect(sink[0]?.content).toContain('reasoning');
  });

  it.each([
    [
      new AiTruncatedError({ model: 'claude-opus-5-5', maxTokens: 16_000, usage }),
      { stopReason: 'max_tokens', refusalCategory: null },
    ],
    [
      new AiRefusalError({ model: 'claude-opus-4-8', category: 'bio', explanation: null, usage }),
      { stopReason: 'refusal', refusalCategory: 'bio' },
    ],
  ])('grava %s com modelo e tokens de `details` e repassa o erro', async (error, expected) => {
    vi.spyOn(AiGatewayService.prototype, 'complete').mockRejectedValue(error);
    const { recorder, gateway } = recordingGateway();
    const sink: RecordedCompletion[] = [];

    await expect(recorder.run(sink, () => gateway.complete({ messages }))).rejects.toBe(error);

    expect(sink).toEqual([
      expect.objectContaining({
        ...expected,
        servedModel: error.details.model,
        usage,
        content: null,
        error: error.message,
      }),
    ]);
  });

  // F1 — a pesquisa web também custa (tokens + buscas) e precisa entrar na conta.
  describe('pesquisa web', () => {
    const researchParams = {
      model: 'claude-sonnet-5-5',
      system: 'Você é a etapa de pesquisa.',
      prompt: 'Síndrome: déficit neurológico focal.',
      allowedDomains: ['gov.br'],
      maxSearches: 5,
      maxFetches: 5,
      maxFetchContentTokens: 6000,
    };

    it('grava a pesquisa com o resumo, o modelo servido e as buscas', async () => {
      vi.spyOn(AiGatewayService.prototype, 'research').mockResolvedValue({
        text: 'Resumo da evidência.',
        citations: [],
        model: 'claude-sonnet-5-5',
        usage: {
          promptTokens: 1000,
          completionTokens: 100,
          totalTokens: 1100,
          webSearchRequests: 3,
        },
        latencyMs: 9000,
        continuations: 0,
        stopReason: 'end_turn',
      });
      const { recorder, gateway } = recordingGateway();
      const sink: RecordedCompletion[] = [];

      await recorder.run(sink, () => gateway.research(researchParams));

      expect(sink).toEqual([
        {
          kind: 'research',
          messages: [
            { role: 'system', content: 'Você é a etapa de pesquisa.' },
            { role: 'user', content: 'Síndrome: déficit neurológico focal.' },
          ],
          requestedModel: 'claude-sonnet-5-5',
          servedModel: 'claude-sonnet-5-5',
          content: 'Resumo da evidência.',
          stopReason: null,
          refusalCategory: null,
          usage: expect.objectContaining({ webSearchRequests: 3 }),
          latencyMs: 9000,
          error: null,
        },
      ]);
    });

    it('grava a pesquisa que falhou e repassa o erro', async () => {
      const { recorder, gateway } = recordingGateway();
      const sink: RecordedCompletion[] = [];

      // O provider determinístico (AI_PROVIDER=test) não tem pesquisa web.
      await expect(
        recorder.run(sink, () => gateway.research(researchParams)),
      ).rejects.toBeInstanceOf(AiCapabilityUnsupportedError);

      expect(sink).toEqual([
        expect.objectContaining({ kind: 'research', servedModel: null, usage: null }),
      ]);
    });
  });
});

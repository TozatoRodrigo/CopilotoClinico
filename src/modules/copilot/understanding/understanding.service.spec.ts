import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AiRefusalError, AiTruncatedError } from '../../ai-gateway/ai-gateway.errors';
import type { ChatMessage } from '../../ai-gateway/providers/provider.interface';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import { CASE_UNDERSTANDING_JSON_SCHEMA } from './case-understanding.json-schema';
import { UNDERSTANDING_SYSTEM_PROMPT } from './understanding-prompt';
import { UnderstandingService } from './understanding.service';
import { intakeReadingFixture, intakeReadingWire } from '../../../../tests/fixtures/intake-reading';
import { INTAKE_READING_JSON_SCHEMA } from '../intake/intake-reading.json-schema';
import { INTAKE_READING_SYSTEM_PROMPT } from '../intake/intake-reading-prompt';

const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
const caseText = 'Homem, 68 anos, hemiparesia direita e afasia há 1h30. PA 182x104.';

function completion(content: string, model = 'claude-sonnet-5-5') {
  return { content, model, usage, latencyMs: 900 };
}

describe('UnderstandingService', () => {
  let complete: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  let service: UnderstandingService;

  beforeEach(() => {
    complete = vi.fn();
    env = {};
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    service = new UnderstandingService({ complete } as unknown as AiGatewayService, config);
  });

  function sentMessages(call = 0): ChatMessage[] {
    const params = complete.mock.calls[call]?.[0] as { messages: ChatMessage[] };
    return params.messages;
  }

  it('returns the validated understanding with model, usage, cost and latency', async () => {
    const understanding = understandingFixture();
    complete.mockResolvedValue(completion(JSON.stringify(understanding)));

    const outcome = await service.understand({ caseText, logLabel: '' });

    expect(outcome.understanding).toEqual(understanding);
    expect(outcome.model).toBe('claude-sonnet-5-5');
    expect(outcome.usage).toEqual(usage);
    // claude-sonnet-5-5: 1000 tokens × $2 + 500 × $10, por milhão.
    expect(outcome.cost).toBe(0.007);
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('asks for structured output with the system prompt and the untrusted case', async () => {
    complete.mockResolvedValue(completion(JSON.stringify(understandingFixture())));

    await service.understand({ caseText, redFlags: { pregnant: true }, logLabel: '' });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ responseSchema: CASE_UNDERSTANDING_JSON_SCHEMA }),
    );
    const [system, user] = sentMessages();
    expect(system).toEqual({ role: 'system', content: UNDERSTANDING_SYSTEM_PROMPT });
    expect(user?.content).toContain(
      `<clinical_case type="UNTRUSTED_INPUT">\n${caseText}\n</clinical_case>`,
    );
    expect(user?.content).toContain('Paciente gestante ou amamentando');
    expect(user?.content).toContain('- deficit-neurologico-focal — ');
    expect(user?.content).toContain('- outro — ');
  });

  describe('modelo e esforço', () => {
    it('uses the gateway default model and low effort when nothing is configured', async () => {
      complete.mockResolvedValue(completion(JSON.stringify(understandingFixture())));

      await service.understand({ caseText, logLabel: '' });

      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: undefined, effort: 'low' }),
      );
    });

    it('honours AI_UNDERSTANDING_MODEL and AI_UNDERSTANDING_EFFORT', async () => {
      env = { AI_UNDERSTANDING_MODEL: ' claude-haiku-5-5 ', AI_UNDERSTANDING_EFFORT: 'medium' };
      complete.mockResolvedValue(completion(JSON.stringify(understandingFixture())));

      await service.understand({ caseText, logLabel: '' });

      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-5-5', effort: 'medium' }),
      );
    });

    it('falls back to low effort on an unknown value', async () => {
      env = { AI_UNDERSTANDING_EFFORT: 'baixo' };
      complete.mockResolvedValue(completion(JSON.stringify(understandingFixture())));

      await service.understand({ caseText, logLabel: '' });

      expect(complete).toHaveBeenCalledWith(expect.objectContaining({ effort: 'low' }));
    });
  });

  describe('retry com o feedback do validador', () => {
    const invalid = JSON.stringify({ ...understandingFixture(), searchQueries: [] });

    it('retries once with the validator errors and keeps the second answer', async () => {
      const understanding = understandingFixture();
      complete
        .mockResolvedValueOnce(completion(invalid))
        .mockResolvedValueOnce(completion(JSON.stringify(understanding)));

      const outcome = await service.understand({ caseText, logLabel: '' });

      expect(outcome.understanding).toEqual(understanding);
      expect(complete).toHaveBeenCalledTimes(2);
      const retry = sentMessages(1);
      expect(retry.slice(0, 2)).toEqual(sentMessages(0));
      expect(retry[2]).toEqual({ role: 'assistant', content: invalid });
      expect(retry[3]?.role).toBe('user');
      expect(retry[3]?.content).toContain('searchQueries must contain at least 1 query');
      // Custo das duas chamadas.
      expect(outcome.cost).toBe(0.014);
      expect(outcome.usage).toEqual({
        promptTokens: 2000,
        completionTokens: 1000,
        totalTokens: 3000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    });

    it('returns null after the second invalid answer, never a third call', async () => {
      complete.mockResolvedValue(completion(invalid));

      const outcome = await service.understand({ caseText, logLabel: '' });

      expect(outcome.understanding).toBeNull();
      expect(complete).toHaveBeenCalledTimes(2);
      expect(outcome.cost).toBe(0.014);
    });

    it('does not replay an empty answer as an assistant turn', async () => {
      complete
        .mockResolvedValueOnce(completion(''))
        .mockResolvedValueOnce(completion(JSON.stringify(understandingFixture())));

      await service.understand({ caseText, logLabel: '' });

      expect(sentMessages(1).map((message) => message.role)).toEqual(['system', 'user', 'user']);
    });
  });

  describe('falha do provider nunca bloqueia a análise', () => {
    it('returns null on truncation without retrying, still counting the cost', async () => {
      complete.mockRejectedValue(
        new AiTruncatedError({ model: 'claude-sonnet-5-5', maxTokens: 16000, usage }),
      );

      const outcome = await service.understand({ caseText, logLabel: '' });

      expect(outcome.understanding).toBeNull();
      expect(outcome.model).toBe('claude-sonnet-5-5');
      expect(outcome.cost).toBe(0.007);
      expect(complete).toHaveBeenCalledTimes(1);
    });

    it('returns null on refusal without retrying', async () => {
      complete.mockRejectedValue(
        new AiRefusalError({ model: 'claude-opus-5-5', category: 'bio', explanation: null, usage }),
      );

      const outcome = await service.understand({ caseText, logLabel: '' });

      expect(outcome.understanding).toBeNull();
      expect(outcome.model).toBe('claude-opus-5-5');
      expect(complete).toHaveBeenCalledTimes(1);
    });

    it('returns null when the retry is truncated', async () => {
      complete
        .mockResolvedValueOnce(completion('não é JSON'))
        .mockRejectedValueOnce(
          new AiTruncatedError({ model: 'claude-sonnet-5-5', maxTokens: 16000, usage }),
        );

      const outcome = await service.understand({ caseText, logLabel: '' });

      expect(outcome.understanding).toBeNull();
      expect(outcome.cost).toBe(0.014);
    });

    it('returns null on a provider or network error', async () => {
      complete.mockRejectedValue(new Error('AI provider error: 503'));

      const outcome = await service.understand({ caseText, logLabel: '' });

      expect(outcome).toMatchObject({ understanding: null, model: null, usage: null, cost: 0 });
    });
  });

  describe('readForIntake (ADR-014)', () => {
    it('returns the validated reading with the intake prompt and schema', async () => {
      const reading = intakeReadingFixture();
      complete.mockResolvedValue(completion(JSON.stringify(intakeReadingWire(reading))));

      const outcome = await service.readForIntake({ caseText, logLabel: ' (conversa)' });

      expect(outcome.reading).toEqual(reading);
      expect(outcome.cost).toBe(0.007);
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ responseSchema: INTAKE_READING_JSON_SCHEMA, effort: 'low' }),
      );
      expect(sentMessages()[0]).toEqual({ role: 'system', content: INTAKE_READING_SYSTEM_PROMPT });
      expect(sentMessages()[1]?.content).toContain(
        'Produce the case understanding and the intake questions now.',
      );
    });

    it('uses AI_INTAKE_MODEL, then the understanding model', async () => {
      complete.mockResolvedValue(completion(JSON.stringify(intakeReadingWire())));
      env = { AI_UNDERSTANDING_MODEL: 'claude-opus-5-5' };
      await service.readForIntake({ caseText, logLabel: '' });
      env = { AI_UNDERSTANDING_MODEL: 'claude-opus-5-5', AI_INTAKE_MODEL: 'claude-sonnet-5-5' };
      await service.readForIntake({ caseText, logLabel: '' });

      expect(complete.mock.calls.map(([params]) => (params as { model?: string }).model)).toEqual([
        'claude-opus-5-5',
        'claude-sonnet-5-5',
      ]);
    });

    it('returns no reading after a second invalid answer, with the cost of both calls', async () => {
      complete.mockResolvedValue(completion('{"not": "a reading"}'));

      const outcome = await service.readForIntake({ caseText, logLabel: '' });

      expect(outcome.reading).toBeNull();
      expect(complete).toHaveBeenCalledTimes(2);
      expect(outcome.cost).toBe(0.014);
    });
  });
});

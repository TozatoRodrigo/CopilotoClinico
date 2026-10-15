import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AiRefusalError } from '../ai-gateway/ai-gateway.errors';
import type { ChatMessage } from '../ai-gateway/providers/provider.interface';
import {
  analysisRow,
  PATIENT_CPF,
  PATIENT_REF,
  reviewQuestionsWire,
  sepsisAnalysis,
} from '../../../tests/fixtures/shift-review';
import { buildReviewMaterial } from './review-material';
import { ReviewQuestionGenerator } from './review-question-generator.service';
import { REVIEW_QUESTIONS_SYSTEM_PROMPT } from './review-questions-prompt';
import { REVIEW_QUESTIONS_JSON_SCHEMA } from './review-questions.schema';

const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

function completion(content: unknown, model = 'claude-sonnet-5-5') {
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    model,
    usage,
    latencyMs: 800,
  };
}

/** Fake do gateway: nenhuma chamada paga sai do teste. */
describe('ReviewQuestionGenerator', () => {
  let complete: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  let generator: ReviewQuestionGenerator;
  const material = buildReviewMaterial([
    analysisRow(),
    analysisRow({ rawOutput: sepsisAnalysis(), createdAt: new Date('2026-10-13T12:00:00Z') }),
  ]);

  beforeEach(() => {
    complete = vi.fn();
    env = {};
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    generator = new ReviewQuestionGenerator({ complete } as unknown as AiGatewayService, config);
  });

  function sentMessages(call = 0): ChatMessage[] {
    return (complete.mock.calls[call]?.[0] as { messages: ChatMessage[] }).messages;
  }

  it('generates schema-valid questions with model, cost and latency', async () => {
    complete.mockResolvedValue(completion(reviewQuestionsWire()));

    const outcome = await generator.generate(material);

    expect(outcome.kind).toBe('generated');
    if (outcome.kind !== 'generated') return;
    expect(outcome.questions.map(({ draft }) => draft.format)).toEqual([
      'multiple_choice',
      'true_false',
      'true_false',
    ]);
    expect(outcome.model).toBe('claude-sonnet-5-5');
    expect(outcome.cost).toBe(0.007);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('calls the gateway as stage review_questions, with the JSON schema and low effort', async () => {
    complete.mockResolvedValue(completion(reviewQuestionsWire()));

    await generator.generate(material);

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'review_questions',
        responseSchema: REVIEW_QUESTIONS_JSON_SCHEMA,
        effort: 'low',
        model: undefined,
      }),
    );
    expect(sentMessages()[0]).toEqual({ role: 'system', content: REVIEW_QUESTIONS_SYSTEM_PROMPT });
  });

  it('routes to AI_SHIFT_REVIEW_MODEL and AI_SHIFT_REVIEW_EFFORT', async () => {
    env.AI_SHIFT_REVIEW_MODEL = 'groq:openai/gpt-oss-120b';
    env.AI_SHIFT_REVIEW_EFFORT = 'medium';
    complete.mockResolvedValue(completion(reviewQuestionsWire()));

    await generator.generate(material);

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'groq:openai/gpt-oss-120b', effort: 'medium' }),
    );
  });

  it('sends the model only masked text: no CPF and no patientRef', async () => {
    complete.mockResolvedValue(completion(reviewQuestionsWire()));

    await generator.generate(material);

    const sent = JSON.stringify(sentMessages());
    expect(sent).not.toContain(PATIENT_CPF);
    expect(sent).not.toContain(PATIENT_REF);
    expect(sent).toContain('[F1]');
    expect(sent).toContain('[F2]');
  });

  it('refuses an invented source and retries once with the validator feedback', async () => {
    complete
      .mockResolvedValueOnce(completion(reviewQuestionsWire([{ sourceKey: 'F7' }])))
      .mockResolvedValueOnce(completion(reviewQuestionsWire()));

    const outcome = await generator.generate(material);

    expect(complete).toHaveBeenCalledTimes(2);
    const retry = sentMessages(1);
    expect(retry.at(-1)?.content).toContain('"F7" is not one of the listed sources');
    expect(outcome.kind === 'generated' && outcome.questions).toHaveLength(3);
    expect(outcome.cost).toBe(0.014);
  });

  it('keeps the valid questions when the retry is no better', async () => {
    const withInvented = completion(reviewQuestionsWire([{ sourceKey: 'F7' }]));
    complete.mockResolvedValue(withInvented);

    const outcome = await generator.generate(material);

    expect(outcome.kind).toBe('generated');
    if (outcome.kind !== 'generated') return;
    expect(outcome.questions.map(({ source }) => source.key)).toEqual(['F1', 'F2']);
  });

  it('never keeps a question with patient data, even after the retry', async () => {
    const leaking = completion(
      reviewQuestionsWire([
        { stem: `CPF ${PATIENT_CPF}: qual exame?` },
        { stem: `Caso ${PATIENT_REF}: verdadeiro?` },
        { explanation: `Paciente ${PATIENT_REF}.` },
      ]),
    );
    complete.mockResolvedValue(leaking);

    const outcome = await generator.generate(material);

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'no_valid_questions' });
  });

  it('fails after invalid JSON twice', async () => {
    complete.mockResolvedValue(completion('não é JSON'));

    const outcome = await generator.generate(material);

    expect(complete).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'invalid_output' });
  });

  it('fails without retry when the model refuses, keeping the cost', async () => {
    complete.mockRejectedValue(
      new AiRefusalError({ model: 'claude-sonnet-5-5', category: null, explanation: null, usage }),
    );

    const outcome = await generator.generate(material);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'refusal', cost: 0.007 });
  });

  it('records only the error class of a provider failure', async () => {
    class RateLimitError extends Error {
      override readonly name = 'RateLimitError';
    }
    complete.mockRejectedValue(new RateLimitError('texto do provedor que não vai ao banco'));

    const outcome = await generator.generate(material);

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'provider_error:RateLimitError' });
  });
});

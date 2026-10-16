import { describe, it, expect } from 'vitest';
import { DeterministicProvider } from './deterministic.provider';
import { validateOutput } from '../../copilot/guardrails/output-validator';
import { INTAKE_READING_JSON_SCHEMA } from '../../copilot/intake/intake-reading.json-schema';
import { validateIntakeReading } from '../../copilot/intake/intake-reading.schema';
import { decideIntake } from '../../copilot/intake/intake-gate';
import { analysisRow, sepsisAnalysis } from '../../../../tests/fixtures/shift-review';
import { buildReviewMaterial } from '../../shift-review/review-material';
import { buildReviewQuestionsMessages } from '../../shift-review/review-questions-prompt';
import {
  checkReviewQuestions,
  REVIEW_QUESTIONS_JSON_SCHEMA,
  ReviewQuestionsOutputSchema,
} from '../../shift-review/review-questions.schema';
import { validateStructured } from '../../copilot/understanding/case-understanding.schema';
import {
  buildCardDraftPrompt,
  CARD_DRAFT_JSON_SCHEMA,
  parseCardDraftResponse,
} from '../../knowledge-cards/drafting/card-draft-prompt';
import { checkCardCitations } from '../../knowledge-cards/domain/citation-check';
import { TREATMENT_TEXT } from '../../../../tests/fixtures/knowledge-cards';

describe('DeterministicProvider', () => {
  const provider = new DeterministicProvider();

  function userWith(text: string) {
    return {
      model: 'test-model',
      messages: [
        { role: 'system' as const, content: 'system prompt' },
        { role: 'user' as const, content: text },
      ],
    };
  }

  it('is named "test"', () => {
    expect(provider.name).toBe('test');
  });

  it('produces a schema-valid definitive conduta by default (closes the loop)', async () => {
    const result = await provider.complete(userWith('Paciente com síndrome gripal leve.'));
    const parsed = JSON.parse(result.content);

    expect(parsed.uncertainty).toBe(false);
    expect(parsed.clarifyingQuestions).toHaveLength(0);
    expect(parsed.recommendations).toHaveLength(1);

    const validation = validateOutput(result.content, []);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('produces an uncertain turn with a blocker question when the sentinel is present', async () => {
    const result = await provider.complete(
      userWith('Quadro atípico [uncertain] sem dados suficientes.'),
    );
    const parsed = JSON.parse(result.content);

    expect(parsed.uncertainty).toBe(true);
    expect(parsed.clarifyingQuestions[0].criticality).toBe('blocker');
    expect(parsed.recommendations).toHaveLength(0);

    const validation = validateOutput(result.content, []);
    expect(validation.valid).toBe(true);
  });

  it('returns a definitive conduta on a subsequent (respond) turn even with the sentinel', async () => {
    const respondText =
      'Caso original [uncertain]\n\n--- Informações adicionais fornecidas pelo médico ---\nP: x\nR: sim';
    const result = await provider.complete(userWith(respondText));
    const parsed = JSON.parse(result.content);

    expect(parsed.uncertainty).toBe(false);
    expect(parsed.clarifyingQuestions).toHaveLength(0);
  });

  it('streams the same content as complete', async () => {
    const chunks: string[] = [];
    for await (const chunk of provider.completeStream(userWith('qualquer caso'))) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toMatch(/recommendations/);
  });

  it('returns content, model and usage as the stream result', async () => {
    const stream = provider.completeStream(userWith('qualquer caso'));
    let next = await stream.next();
    const streamed = next.done ? '' : next.value;
    while (!next.done) next = await stream.next();

    expect(next.value).toMatchObject({
      content: streamed,
      model: 'test-model',
      stopReason: 'end_turn',
      usage: { totalTokens: expect.any(Number) },
    });
    expect(next.value.usage.totalTokens).toBeGreaterThan(0);
  });

  it('returns a fixed 1536-dim unit vector per text', async () => {
    const result = await provider.embed({ model: 'test-embed', texts: ['a', 'b'] });

    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]!).toHaveLength(1536);
    expect(result.embeddings[0]![0]).toBe(1);
    expect(result.embeddings[0]![1]).toBe(0);
  });

  describe('case reading of the guided copilot (ADR-014)', () => {
    async function readingFor(text: string) {
      const result = await provider.complete({
        ...userWith(text),
        responseSchema: INTAKE_READING_JSON_SCHEMA,
      });
      const validation = validateIntakeReading(result.content);
      if (!validation.valid) throw new Error(validation.errors.join(' | '));
      return validation.value;
    }

    it('reads a complete case by default', async () => {
      expect(decideIntake(await readingFor('Cefaleia leve.')).path).toBe('complete');
    });

    it('asks two questions for [incompleto]', async () => {
      const decision = decideIntake(await readingFor('Cefaleia forte [incompleto]'));

      expect(decision.path).toBe('ask');
      expect(decision.questions.map((question) => question.answerType)).toEqual([
        'boolean',
        'vitals',
      ]);
    });

    it('reads an unstable patient for [instavel]', async () => {
      expect(decideIntake(await readingFor('Rebaixado [instavel]')).path).toBe('unstable');
    });
  });

  describe('CC-801 — shift review questions', () => {
    it('cites the listed sources, so the review runs offline end to end', async () => {
      const material = buildReviewMaterial([
        analysisRow(),
        analysisRow({ rawOutput: sepsisAnalysis(), createdAt: new Date('2026-10-13T12:00:00Z') }),
      ]);

      const result = await provider.complete({
        model: 'test-model',
        messages: buildReviewQuestionsMessages(material, 3),
        responseSchema: REVIEW_QUESTIONS_JSON_SCHEMA,
      });
      const validation = validateStructured(ReviewQuestionsOutputSchema, result.content);

      expect(validation.valid).toBe(true);
      if (!validation.valid) return;
      const { accepted, errors } = checkReviewQuestions(validation.value, material);
      expect(errors).toEqual([]);
      expect(accepted.map(({ source }) => source.key)).toEqual(['F1', 'F2', 'F1']);
    });
  });

  describe('knowledge card draft (CC-403)', () => {
    async function draftFor(sourceText: string) {
      const result = await provider.complete({
        ...userWith(
          buildCardDraftPrompt({
            topic: 'Meningite bacteriana',
            syndrome: 'febre',
            sources: [
              { key: 'S1', title: 'PCDT', sourceVersion: '1', section: null, text: sourceText },
            ],
          }),
        ),
        responseSchema: CARD_DRAFT_JSON_SCHEMA,
      });
      const parsed = parseCardDraftResponse(result.content);
      if (!parsed.success) throw new Error(parsed.reason);
      return parsed.cards;
    }

    it('drafts one card that passes the citation check against the excerpt', async () => {
      const [card, ...rest] = await draftFor(TREATMENT_TEXT);

      expect(rest).toEqual([]);
      expect(card).toBeDefined();
      if (!card) return;
      expect(checkCardCitations(card, new Map([['S1', TREATMENT_TEXT]]))).toEqual([]);
    });

    it('drafts no card when the excerpt has no line long enough to quote', async () => {
      expect(await draftFor('[PCDT · curto]\nCurto.')).toEqual([]);
    });
  });
});

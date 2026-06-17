import { describe, it, expect } from 'vitest';
import { DeterministicProvider } from './deterministic.provider';
import { validateOutput } from '../../copilot/guardrails/output-validator';

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
    const result = await provider.complete(userWith('Quadro atípico [uncertain] sem dados suficientes.'));
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

  it('returns a fixed 1536-dim unit vector per text', async () => {
    const result = await provider.embed({ model: 'test-embed', texts: ['a', 'b'] });

    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]!).toHaveLength(1536);
    expect(result.embeddings[0]![0]).toBe(1);
    expect(result.embeddings[0]![1]).toBe(0);
  });
});

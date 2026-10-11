import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { readDecisionPipeline } from './decision.settings';

function read(env: Record<string, string>) {
  return readDecisionPipeline({ get: (key: string) => env[key] } as unknown as ConfigService);
}

describe('readDecisionPipeline', () => {
  it('defaults to the production pipeline: legacy, internal knowledge base, v1', () => {
    expect(read({})).toEqual({
      pipeline: { reasoning: 'legacy', decisionPrompt: 'v1', knowledgeSource: 'internal_kb' },
      downgrades: [],
    });
  });

  it.each([
    ['v2', 'web'],
    ['v2', 'model_only'],
    ['v1', 'internal_kb'],
    ['V2', 'WEB'],
    ['v3', 'web'],
    ['v3', 'model_only'],
    ['v3', 'internal_kb'],
  ])(
    'reads COPILOT_DECISION_PROMPT=%s and COPILOT_KNOWLEDGE_SOURCE=%s with stages',
    (prompt, source) => {
      const { pipeline, downgrades } = read({
        COPILOT_REASONING: 'stages',
        COPILOT_DECISION_PROMPT: prompt,
        COPILOT_KNOWLEDGE_SOURCE: source,
      });

      expect(pipeline).toEqual({
        reasoning: 'stages',
        decisionPrompt: prompt.toLowerCase(),
        knowledgeSource: source.toLowerCase(),
      });
      expect(downgrades).toEqual([]);
    },
  );

  it('falls back to the defaults on a typo', () => {
    const { pipeline } = read({
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v9',
      COPILOT_KNOWLEDGE_SOURCE: 'internet',
    });

    expect(pipeline).toMatchObject({ decisionPrompt: 'v1', knowledgeSource: 'internal_kb' });
  });

  it('uses v1 and says why when v2 is asked for without stages', () => {
    const { pipeline, downgrades } = read({ COPILOT_DECISION_PROMPT: 'v2' });

    expect(pipeline.decisionPrompt).toBe('v1');
    expect(downgrades).toEqual([expect.stringContaining('COPILOT_DECISION_PROMPT=v2 exige')]);
  });

  it('uses v1 and says why when v3 is asked for without stages', () => {
    const { pipeline, downgrades } = read({ COPILOT_DECISION_PROMPT: 'v3' });

    expect(pipeline.decisionPrompt).toBe('v1');
    expect(downgrades).toEqual([
      'COPILOT_DECISION_PROMPT=v3 exige COPILOT_REASONING=stages: usando v1',
    ]);
  });

  it('never falls back to the embedding search when web is asked for without stages', () => {
    const { pipeline, downgrades } = read({ COPILOT_KNOWLEDGE_SOURCE: 'web' });

    expect(pipeline.knowledgeSource).toBe('model_only');
    expect(downgrades).toEqual([expect.stringContaining('COPILOT_KNOWLEDGE_SOURCE=web exige')]);
  });

  it('does not pay for a research the v1 prompt would ignore', () => {
    const { pipeline, downgrades } = read({
      COPILOT_REASONING: 'stages',
      COPILOT_KNOWLEDGE_SOURCE: 'web',
    });

    expect(pipeline).toEqual({
      reasoning: 'stages',
      decisionPrompt: 'v1',
      knowledgeSource: 'model_only',
    });
    expect(downgrades).toEqual([expect.stringContaining('COPILOT_DECISION_PROMPT=v2')]);
  });

  describe('COPILOT_KNOWLEDGE_SOURCE=verify', () => {
    it.each(['v2', 'v3'])('verifies after a %s decision with stages', (prompt) => {
      const { pipeline, downgrades } = read({
        COPILOT_REASONING: 'stages',
        COPILOT_DECISION_PROMPT: prompt,
        COPILOT_KNOWLEDGE_SOURCE: 'verify',
      });

      expect(pipeline).toEqual({
        reasoning: 'stages',
        decisionPrompt: prompt,
        knowledgeSource: 'verify',
      });
      expect(downgrades).toEqual([]);
    });

    it('decides without the embedding search and says why when stages is off', () => {
      const { pipeline, downgrades } = read({
        COPILOT_DECISION_PROMPT: 'v3',
        COPILOT_KNOWLEDGE_SOURCE: 'verify',
      });

      expect(pipeline).toEqual({
        reasoning: 'legacy',
        decisionPrompt: 'v1',
        knowledgeSource: 'model_only',
      });
      expect(downgrades).toEqual([
        'COPILOT_DECISION_PROMPT=v3 exige COPILOT_REASONING=stages: usando v1',
        'COPILOT_KNOWLEDGE_SOURCE=verify exige COPILOT_REASONING=stages e COPILOT_DECISION_PROMPT=v2 ou v3: seguindo sem verificação (model_only)',
      ]);
    });

    it('does not pay for a verification the v1 prompt could not use', () => {
      const { pipeline } = read({
        COPILOT_REASONING: 'stages',
        COPILOT_KNOWLEDGE_SOURCE: 'verify',
      });

      expect(pipeline).toMatchObject({ decisionPrompt: 'v1', knowledgeSource: 'model_only' });
    });
  });

  it('keeps model_only without stages: it needs no understanding', () => {
    const { pipeline, downgrades } = read({ COPILOT_KNOWLEDGE_SOURCE: 'model_only' });

    expect(pipeline).toMatchObject({ reasoning: 'legacy', knowledgeSource: 'model_only' });
    expect(downgrades).toEqual([]);
  });
});

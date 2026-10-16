import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import { chooseDecisionModel, readDecisionPipeline } from './decision.settings';

function read(env: Record<string, string>) {
  return readDecisionPipeline({ get: (key: string) => env[key] } as unknown as ConfigService);
}

describe('readDecisionPipeline', () => {
  it('defaults to the production pipeline: legacy, internal knowledge base, v1', () => {
    expect(read({})).toEqual({
      pipeline: {
        reasoning: 'legacy',
        decisionPrompt: 'v1',
        knowledgeSource: 'internal_kb',
        whyLine: false,
      },
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
        whyLine: false,
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
      whyLine: false,
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
        whyLine: false,
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
        whyLine: false,
      });
      expect(downgrades).toEqual([
        'COPILOT_DECISION_PROMPT=v3 exige COPILOT_REASONING=stages: usando v1',
        'COPILOT_KNOWLEDGE_SOURCE=verify exige COPILOT_REASONING=stages e COPILOT_DECISION_PROMPT=v2, v3 ou v4: seguindo sem verificação (model_only)',
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

  // CC-601 — linha de "por quê" em cada conduta "agora".
  describe('COPILOT_WHY_LINE', () => {
    const v3 = { COPILOT_REASONING: 'stages', COPILOT_DECISION_PROMPT: 'v3' };

    it.each(['v3', 'v4'])('asks for the why line with %s', (prompt) => {
      const { pipeline, downgrades } = read({
        ...v3,
        COPILOT_DECISION_PROMPT: prompt,
        COPILOT_WHY_LINE: 'on',
      });

      expect(pipeline).toMatchObject({ decisionPrompt: prompt, whyLine: true });
      expect(downgrades).toEqual([]);
    });

    it.each([[{}], [{ COPILOT_WHY_LINE: 'off' }], [{ COPILOT_WHY_LINE: 'talvez' }]])(
      'stays off by default, when off and on a typo (%o)',
      (flag) => {
        const { pipeline, downgrades } = read({ ...v3, ...flag });

        expect(pipeline.whyLine).toBe(false);
        expect(downgrades).toEqual([]);
      },
    );

    it('stays off and says why with v2, whose format does not carry the line', () => {
      const { pipeline, downgrades } = read({
        ...v3,
        COPILOT_DECISION_PROMPT: 'v2',
        COPILOT_WHY_LINE: 'true',
      });

      expect(pipeline.whyLine).toBe(false);
      expect(downgrades).toEqual([
        'COPILOT_WHY_LINE exige COPILOT_DECISION_PROMPT=v3 ou v4 (efetivo: v2): plano sem a linha de por quê',
      ]);
    });

    it('stays off when v3 falls back to v1 without stages', () => {
      const { pipeline, downgrades } = read({
        COPILOT_DECISION_PROMPT: 'v3',
        COPILOT_WHY_LINE: 'on',
      });

      expect(pipeline).toMatchObject({ decisionPrompt: 'v1', whyLine: false });
      expect(downgrades).toEqual([
        'COPILOT_DECISION_PROMPT=v3 exige COPILOT_REASONING=stages: usando v1',
        'COPILOT_WHY_LINE exige COPILOT_DECISION_PROMPT=v3 ou v4 (efetivo: v1): plano sem a linha de por quê',
      ]);
    });
  });
});

describe('chooseDecisionModel', () => {
  const ROUTED = {
    AI_DECISION_MODEL: 'groq:openai/gpt-oss-120b',
    AI_DECISION_CRITICAL_MODEL: 'claude-opus-5-5',
  };

  function choose(env: Record<string, string>, understanding = understandingFixture()) {
    return chooseDecisionModel(
      { get: (key: string) => env[key] } as unknown as ConfigService,
      understanding,
    );
  }

  it('keeps AI_MODEL in both routes when nothing is configured', () => {
    expect(choose({})).toEqual({ route: 'standard', model: undefined });
    expect(choose({}, understandingFixture({ timeCritical: true }))).toEqual({
      route: 'critical',
      model: undefined,
    });
  });

  it('sends a stable, non time-critical case to AI_DECISION_MODEL', () => {
    expect(choose(ROUTED)).toEqual({ route: 'standard', model: 'groq:openai/gpt-oss-120b' });
  });

  it.each([
    ['time-critical', understandingFixture({ timeCritical: true })],
    ['unstable', understandingFixture({ instability: { present: true, findings: ['PA 70x40'] } })],
  ])('sends a %s case to AI_DECISION_CRITICAL_MODEL', (_label, understanding) => {
    expect(choose(ROUTED, understanding)).toEqual({ route: 'critical', model: 'claude-opus-5-5' });
  });

  it('treats a case without understanding as critical', () => {
    expect(
      chooseDecisionModel(
        { get: (key: string) => ROUTED[key as keyof typeof ROUTED] } as unknown as ConfigService,
        null,
      ),
    ).toEqual({ route: 'critical', model: 'claude-opus-5-5' });
  });

  it('falls back to AI_DECISION_MODEL in the critical route when no critical model is set', () => {
    expect(
      choose(
        { AI_DECISION_MODEL: 'claude-sonnet-5-5' },
        understandingFixture({ timeCritical: true }),
      ),
    ).toEqual({ route: 'critical', model: 'claude-sonnet-5-5' });
  });

  it('ignores blank values', () => {
    expect(choose({ AI_DECISION_MODEL: ' ', AI_DECISION_CRITICAL_MODEL: '' })).toEqual({
      route: 'standard',
      model: undefined,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AiCapabilityUnsupportedError, AiRefusalError } from '../../ai-gateway/ai-gateway.errors';
import type {
  ResearchParams,
  ResearchResponse,
} from '../../ai-gateway/providers/provider.interface';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import { WebResearchService } from './web-research.service';
import { buildResearchPrompt, WEB_RESEARCH_SYSTEM_PROMPT } from './web-research-prompt';
import { DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS } from './web-research.settings';

const AHA = 'https://www.ahajournals.org/doi/10.1161/STR.0000000000000211';

function response(overrides: Partial<ResearchResponse> = {}): ResearchResponse {
  return {
    text: 'Resumo da evidência.',
    citations: [{ url: AHA, title: 'AHA/ASA 2019', citedText: 'Alteplase within 4.5 h.' }],
    model: 'claude-sonnet-5-5',
    // 100 mil tokens de entrada × $2 + 2 mil de saída × $10, por milhão, + 3 buscas.
    usage: {
      promptTokens: 100_000,
      completionTokens: 2_000,
      totalTokens: 102_000,
      webSearchRequests: 3,
    },
    latencyMs: 12_000,
    continuations: 0,
    stopReason: 'end_turn',
    ...overrides,
  };
}

describe('WebResearchService', () => {
  let research: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  let service: WebResearchService;

  beforeEach(() => {
    research = vi.fn().mockResolvedValue(response());
    env = {};
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    service = new WebResearchService({ research } as unknown as AiGatewayService, config);
  });

  function sentParams(): Omit<ResearchParams, 'model'> & { model?: string } {
    return research.mock.calls[0]![0] as Omit<ResearchParams, 'model'> & { model?: string };
  }

  it('researches from the understanding with the default model, effort, caps and allowlist', async () => {
    await service.research({ understanding: understandingFixture(), logLabel: '' });

    expect(sentParams()).toEqual({
      model: 'claude-sonnet-5-5',
      effort: 'low',
      system: WEB_RESEARCH_SYSTEM_PROMPT,
      prompt: buildResearchPrompt(understandingFixture()),
      allowedDomains: [...DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS],
      maxSearches: 5,
      maxFetches: 5,
      maxFetchContentTokens: 6000,
    });
  });

  it('never sends the case or patient details to the research', async () => {
    const understanding = understandingFixture();

    await service.research({ understanding, logLabel: '' });

    const { prompt } = sentParams();
    expect(prompt).not.toContain(understanding.problemRepresentation);
    expect(prompt).not.toContain('68');
    expect(prompt).not.toContain('182');
    expect(prompt).not.toContain(understanding.cannotMiss[0]!.whyPlausible);
  });

  it('follows the configured model, effort, search cap and allowlist', async () => {
    env = {
      AI_RESEARCH_MODEL: 'claude-opus-5-5',
      AI_RESEARCH_EFFORT: 'medium',
      WEB_RESEARCH_MAX_SEARCHES: '3',
      WEB_RESEARCH_ALLOWED_DOMAINS: 'gov.br,ahajournals.org',
    };

    await service.research({ understanding: understandingFixture(), logLabel: '' });

    expect(sentParams()).toMatchObject({
      model: 'claude-opus-5-5',
      effort: 'medium',
      maxSearches: 3,
      maxFetches: 3,
      allowedDomains: ['gov.br', 'ahajournals.org'],
    });
  });

  it('returns the cited pages as evidence, with the cost of tokens and searches', async () => {
    const outcome = await service.research({ understanding: understandingFixture(), logLabel: '' });

    expect(outcome.evidence).toEqual([
      {
        id: 'web:1',
        url: AHA,
        title: 'AHA/ASA 2019',
        domain: 'ahajournals.org',
        citedText: 'Alteplase within 4.5 h.',
      },
    ]);
    expect(outcome.model).toBe('claude-sonnet-5-5');
    // 0,2 (entrada) + 0,02 (saída) + 0,03 (3 buscas).
    expect(outcome.cost).toBeCloseTo(0.25, 10);
    expect(outcome.fallbackReason).toBeNull();
  });

  describe('fallback para o conhecimento do modelo', () => {
    it('falls back when the research cites nothing', async () => {
      research.mockResolvedValue(response({ citations: [] }));

      const outcome = await service.research({
        understanding: understandingFixture(),
        logLabel: '',
      });

      expect(outcome.evidence).toEqual([]);
      expect(outcome.fallbackReason).toContain('nenhuma citação');
      expect(outcome.cost).toBeCloseTo(0.25, 10);
    });

    it('falls back when every citation is outside the allowlist', async () => {
      research.mockResolvedValue(
        response({
          citations: [{ url: 'https://blog.com/avc', title: 'Blog', citedText: 'Dica.' }],
        }),
      );

      const outcome = await service.research({
        understanding: understandingFixture(),
        logLabel: '',
      });

      expect(outcome.evidence).toEqual([]);
      expect(outcome.fallbackReason).not.toBeNull();
    });

    it('falls back on a refusal, still counting what it cost', async () => {
      research.mockRejectedValue(
        new AiRefusalError({
          model: 'claude-sonnet-5-5',
          category: 'bio',
          explanation: null,
          usage: { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 },
        }),
      );

      const outcome = await service.research({
        understanding: understandingFixture(),
        logLabel: '',
      });

      expect(outcome.evidence).toEqual([]);
      expect(outcome.model).toBe('claude-sonnet-5-5');
      expect(outcome.cost).toBe(2);
      expect(outcome.fallbackReason).toContain('refused');
    });

    it('falls back when the provider has no web research', async () => {
      research.mockRejectedValue(
        new AiCapabilityUnsupportedError({ provider: 'openai', capability: 'web_research' }),
      );

      const outcome = await service.research({
        understanding: understandingFixture(),
        logLabel: '',
      });

      expect(outcome).toMatchObject({ evidence: [], model: null, usage: null, cost: 0 });
      expect(outcome.fallbackReason).toContain('openai');
    });

    it('falls back on a provider or network error', async () => {
      research.mockRejectedValue(new Error('fetch failed'));

      const outcome = await service.research({
        understanding: understandingFixture(),
        logLabel: '',
      });

      expect(outcome).toMatchObject({ evidence: [], cost: 0, fallbackReason: 'fetch failed' });
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import type { ConfigService } from '@nestjs/config';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import {
  AiCapabilityUnsupportedError,
  AiRefusalError,
  AiTruncatedError,
} from '../../ai-gateway/ai-gateway.errors';
import type {
  CompletionParams,
  ResearchParams,
  ResearchResponse,
} from '../../ai-gateway/providers/provider.interface';
import type { RecommendationCategory } from '../../../shared/contracts/clinical';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import { SourceVerificationService } from './source-verification.service';
import {
  buildSourceAttachPrompt,
  buildSourceVerificationPrompt,
  numberActionsForVerification,
  SOURCE_ATTACH_JSON_SCHEMA,
  SOURCE_ATTACH_SYSTEM_PROMPT,
  SOURCE_VERIFICATION_SYSTEM_PROMPT,
} from './source-verification-prompt';
import { DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS } from './web-research.settings';

vi.mock('@sentry/node', () => ({ captureMessage: vi.fn() }));

const GOV = 'https://www.gov.br/saude/protocolo-avc';

const recommendations: Array<{ action: string; category: RecommendationCategory }> = [
  { action: 'TC de crânio sem contraste', category: 'diagnostic' },
  { action: 'Trombólise com alteplase', category: 'therapeutic' },
];

function researchResponse(overrides: Partial<ResearchResponse> = {}): ResearchResponse {
  return {
    text: '[A1] Alteplase 0,9 mg/kg IV.',
    citations: [{ url: GOV, title: 'Protocolo de AVC', citedText: 'Alteplase 0,9 mg/kg IV.' }],
    model: 'claude-sonnet-5-5',
    // 100 mil tokens de entrada × $2 + 2 mil de saída × $10, por milhão, + 3 buscas = 0,25.
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

// claude-sonnet-5-5: 10 mil × $2 + mil × $10, por milhão = 0,03.
function attachCompletion(items: unknown[]) {
  return {
    content: JSON.stringify({ items }),
    model: 'claude-sonnet-5-5',
    usage: { promptTokens: 10_000, completionTokens: 1_000, totalTokens: 11_000 },
    latencyMs: 800,
  };
}

describe('SourceVerificationService', () => {
  let research: ReturnType<typeof vi.fn>;
  let complete: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  let service: SourceVerificationService;

  beforeEach(() => {
    vi.mocked(Sentry.captureMessage).mockClear();
    research = vi.fn().mockResolvedValue(researchResponse());
    complete = vi
      .fn()
      .mockResolvedValue(
        attachCompletion([
          { action: 1, citationId: 'web:1', dose: '0,9 mg/kg IV', conflict: null },
        ]),
      );
    env = {};
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    service = new SourceVerificationService(
      { research, complete } as unknown as AiGatewayService,
      config,
    );
  });

  function verify() {
    return service.verify({ understanding: understandingFixture(), recommendations, logLabel: '' });
  }

  const actions = numberActionsForVerification(recommendations);

  it('researches with the web research settings and the verification prompt', async () => {
    await verify();

    expect(research.mock.calls[0]![0]).toEqual({
      model: 'claude-sonnet-5-5',
      effort: 'low',
      system: SOURCE_VERIFICATION_SYSTEM_PROMPT,
      prompt: buildSourceVerificationPrompt(understandingFixture(), actions),
      allowedDomains: [...DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS],
      maxSearches: 5,
      maxFetches: 5,
      maxFetchContentTokens: 6000,
    } satisfies Omit<ResearchParams, 'model'> & { model?: string });
  });

  it('follows the configured research model, effort, search cap and allowlist', async () => {
    env = {
      AI_RESEARCH_MODEL: 'claude-opus-5-5',
      AI_RESEARCH_EFFORT: 'medium',
      WEB_RESEARCH_MAX_SEARCHES: '3',
      WEB_RESEARCH_ALLOWED_DOMAINS: 'gov.br',
    };

    await verify();

    expect(research.mock.calls[0]![0]).toMatchObject({
      model: 'claude-opus-5-5',
      effort: 'medium',
      maxSearches: 3,
      allowedDomains: ['gov.br'],
    });
  });

  it('links with a structured call: low effort, attach prompt and the cited excerpts', async () => {
    await verify();

    const params = complete.mock.calls[0]![0] as Omit<CompletionParams, 'model'> & {
      model?: string;
    };
    expect(params).toEqual({
      model: 'claude-sonnet-5-5',
      effort: 'low',
      messages: [
        { role: 'system', content: SOURCE_ATTACH_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildSourceAttachPrompt(actions, [
            {
              id: 'web:1',
              url: GOV,
              title: 'Protocolo de AVC',
              domain: 'gov.br',
              citedText: 'Alteplase 0,9 mg/kg IV.',
            },
          ]),
        },
      ],
      responseSchema: SOURCE_ATTACH_JSON_SCHEMA,
    });
  });

  it('uses AI_VERIFY_ATTACH_MODEL for the link', async () => {
    env = { AI_VERIFY_ATTACH_MODEL: 'claude-haiku-5-5' };

    await verify();

    expect(complete.mock.calls[0]![0]).toMatchObject({ model: 'claude-haiku-5-5' });
  });

  it('returns the evidence, the accepted links and the trace of research plus link', async () => {
    const outcome = await verify();

    expect(outcome.evidence.map((item) => item.id)).toEqual(['web:1']);
    // [A1] é a recomendação 1 da decisão.
    expect([...outcome.links.entries()]).toEqual([
      [1, { citationId: 'web:1', dose: '0,9 mg/kg IV', conflict: null }],
    ]);
    expect(outcome).toMatchObject({
      model: 'claude-sonnet-5-5',
      usage: { webSearchRequests: 3 },
      fallbackReason: null,
    });
    // Pesquisa (0,25) + vínculo (0,03).
    expect(outcome.cost).toBeCloseTo(0.28, 10);
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
  });

  describe('nunca bloqueia: fallback com a saída da decisão intacta', () => {
    it('does not call anything when there is no treatment or stabilization to verify', async () => {
      const outcome = await service.verify({
        understanding: understandingFixture(),
        recommendations: [{ action: 'TC de crânio', category: 'diagnostic' }],
        logLabel: '',
      });

      expect(research).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ evidence: [], cost: 0, model: null });
      expect(outcome.links.size).toBe(0);
      expect(outcome.fallbackReason).toContain('nenhuma conduta');
    });

    it('does not link when the research cites no allowed source', async () => {
      research.mockResolvedValue(researchResponse({ citations: [] }));

      const outcome = await verify();

      expect(complete).not.toHaveBeenCalled();
      expect(outcome.links.size).toBe(0);
      expect(outcome.fallbackReason).toContain('nenhuma citação');
      expect(outcome.cost).toBeCloseTo(0.25, 10);
    });

    it('keeps the evidence but no link when the link is not JSON', async () => {
      complete.mockResolvedValue({ ...attachCompletion([]), content: 'Não sei.' });

      const outcome = await verify();

      expect(outcome.evidence).toHaveLength(1);
      expect(outcome.links.size).toBe(0);
      expect(outcome.fallbackReason).toBe('o vínculo não devolveu JSON');
      expect(outcome.cost).toBeCloseTo(0.28, 10);
    });

    it('says so when no action got a valid link', async () => {
      complete.mockResolvedValue(
        attachCompletion([{ action: 1, citationId: 'web:7', dose: null, conflict: null }]),
      );

      const outcome = await verify();

      expect(outcome.links.size).toBe(0);
      expect(outcome.fallbackReason).toContain('nenhuma conduta vinculada');
    });

    it('counts the cost of a refused research', async () => {
      research.mockRejectedValue(
        new AiRefusalError({
          model: 'claude-sonnet-5-5',
          category: 'bio',
          explanation: null,
          usage: { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 },
        }),
      );

      const outcome = await verify();

      expect(outcome).toMatchObject({ evidence: [], model: 'claude-sonnet-5-5', cost: 2 });
      expect(outcome.fallbackReason).toContain('refused');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('keeps the research model and adds the cost of a truncated link', async () => {
      complete.mockRejectedValue(
        new AiTruncatedError({
          model: 'claude-haiku-5-5',
          maxTokens: 16000,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
      );

      const outcome = await verify();

      expect(outcome.model).toBe('claude-sonnet-5-5');
      expect(outcome.links.size).toBe(0);
      expect(outcome.fallbackReason).toContain('output token limit');
      expect(outcome.cost).toBeCloseTo(0.25, 10);
    });

    it('falls back when the provider has no web research', async () => {
      research.mockRejectedValue(
        new AiCapabilityUnsupportedError({ provider: 'openai', capability: 'web_research' }),
      );

      const outcome = await verify();

      expect(outcome).toMatchObject({ evidence: [], model: null, cost: 0 });
      expect(outcome.fallbackReason).toContain('openai');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('reports a provider or network error to Sentry', async () => {
      complete.mockRejectedValue(new Error('fetch failed'));

      const outcome = await verify();

      expect(outcome.links.size).toBe(0);
      expect(outcome.fallbackReason).toBe('fetch failed');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'SOURCE_VERIFICATION_PROVIDER_ERROR: fetch failed',
        'error',
      );
    });
  });
});

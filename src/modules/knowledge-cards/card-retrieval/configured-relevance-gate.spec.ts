import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jevNoulBody, jevResponse } from '../../../../tests/fixtures/jev';
import { reviewedCard } from '../../../../tests/fixtures/reviewed-cards';
import { SimilarityThemeGate, type CardRelevanceContext } from './card-relevance-gate';
import { readCardGateKind } from './card-relevance-gate.settings';
import { TeiCardReranker } from './card-reranker';
import { ConfiguredRelevanceGate } from './configured-relevance-gate';
import { JevRelevanceGate } from './jev-relevance-gate';
import { RerankerRelevanceGate } from './reranker-relevance-gate';

vi.mock('@sentry/node', () => ({ captureMessage: vi.fn() }));

/**
 * CC-407 — `CARD_RELEVANCE_GATE=threshold|jev|reranker`: o portão escolhido a
 * cada análise e o fallback para o por limiar. Nenhuma chamada sai: o Jev e o
 * TEI respondem por `fetch` falsos.
 */

const meningitisCase: CardRelevanceContext = {
  syndrome: 'febre',
  hypotheses: ['Meningite bacteriana'],
  problemRepresentation: 'Adulto com febre, cefaleia e rigidez de nuca',
};

/** Parecido o bastante para o por limiar (padrão 0,5) e da mesma síndrome. */
const candidates = [{ card: reviewedCard(), similarity: 0.7 }];

describe('ConfiguredRelevanceGate (CC-407)', () => {
  let jevFetch: ReturnType<typeof vi.fn>;
  let rerankerFetch: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  function gate(env: Record<string, string>) {
    const config = new ConfigService(env);
    return new ConfiguredRelevanceGate(
      config,
      new SimilarityThemeGate(config),
      new JevRelevanceGate(config, jevFetch as unknown as typeof fetch),
      new RerankerRelevanceGate(
        config,
        new TeiCardReranker(config, rerankerFetch as unknown as typeof fetch),
      ),
    );
  }

  beforeEach(() => {
    vi.mocked(Sentry.captureMessage).mockClear();
    jevFetch = vi.fn().mockRejectedValue(new Error('nenhum teste chama a TypeSafe'));
    rerankerFetch = vi.fn().mockRejectedValue(new Error('nenhum teste chama o reranker'));
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  it.each<Record<string, string>>([
    {},
    { CARD_RELEVANCE_GATE: 'talvez' },
    { CARD_RELEVANCE_GATE: 'threshold', JEV_API_KEY: 'k', CARD_RERANKER_URL: 'http://r' },
  ])('padrão (e valor irreconhecível) = por limiar, sem rede: %o', async (env) => {
    expect(readCardGateKind(new ConfigService(env))).toBe('threshold');
    await expect(gate(env).judge(candidates, meningitisCase)).resolves.toMatchObject({
      gate: 'similarity-theme',
      fallback: null,
      verdicts: [{ applies: true, reason: 'applies', score: null }],
    });
    expect(jevFetch).not.toHaveBeenCalled();
    expect(rerankerFetch).not.toHaveBeenCalled();
  });

  it('jev com chave: decide o Jev', async () => {
    jevFetch.mockResolvedValue(jevResponse(jevNoulBody(0.2, 'card_applies')));
    const env = { CARD_RELEVANCE_GATE: 'jev', JEV_API_KEY: 'k' };

    await expect(gate(env).judge(candidates, meningitisCase)).resolves.toMatchObject({
      gate: 'jev',
      fallback: null,
      verdicts: [{ applies: false, reason: 'gate_rejected', score: 0.2 }],
    });
    expect(gate(env).name).toBe('jev');
  });

  it('jev sem chave: decide o por limiar e loga CARD_GATE_FALLBACK', async () => {
    await expect(
      gate({ CARD_RELEVANCE_GATE: 'jev' }).judge(candidates, meningitisCase),
    ).resolves.toMatchObject({
      gate: 'similarity-theme',
      fallback: 'jev_unconfigured',
      verdicts: [{ applies: true }],
    });
    expect(jevFetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CARD_GATE_FALLBACK gate=jev'));
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('jev fora do ar: decide o por limiar, loga e manda ao Sentry sem o corpo da resposta', async () => {
    jevFetch.mockResolvedValue(jevResponse({ eco: 'Adulto com febre' }, 529));

    await expect(
      gate({ CARD_RELEVANCE_GATE: 'jev', JEV_API_KEY: 'k' }).judge(candidates, meningitisCase),
    ).resolves.toMatchObject({ gate: 'similarity-theme', fallback: 'jev_failed' });
    expect(error).toHaveBeenCalledWith(
      'CARD_GATE_FALLBACK gate=jev reason=failed error=Jev http 529',
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'CARD_GATE_FALLBACK gate=jev reason=failed error=Jev http 529',
      'error',
    );
  });

  it('reranker com serviço: decide o reranker', async () => {
    rerankerFetch.mockResolvedValue(
      new Response(JSON.stringify([{ index: 0, score: 0.93 }]), { status: 200 }),
    );

    await expect(
      gate({ CARD_RELEVANCE_GATE: 'reranker', CARD_RERANKER_URL: 'http://reranker' }).judge(
        candidates,
        meningitisCase,
      ),
    ).resolves.toMatchObject({ gate: 'reranker', fallback: null, verdicts: [{ score: 0.93 }] });
  });

  it('reranker sem serviço ou fora do ar: decide o por limiar', async () => {
    await expect(
      gate({ CARD_RELEVANCE_GATE: 'reranker' }).judge(candidates, meningitisCase),
    ).resolves.toMatchObject({ gate: 'similarity-theme', fallback: 'reranker_unconfigured' });

    rerankerFetch.mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      gate({ CARD_RELEVANCE_GATE: 'reranker', CARD_RERANKER_URL: 'http://reranker' }).judge(
        candidates,
        meningitisCase,
      ),
    ).resolves.toMatchObject({ gate: 'similarity-theme', fallback: 'reranker_failed' });
    expect(error).toHaveBeenCalledWith(
      'CARD_GATE_FALLBACK gate=reranker reason=failed error=Reranker network',
    );
  });

  it('o fallback não afrouxa o por limiar: cartão de outra síndrome continua fora', async () => {
    const otherSyndrome = [{ card: reviewedCard({ syndrome: 'dor-toracica' }), similarity: 0.95 }];

    await expect(
      gate({ CARD_RELEVANCE_GATE: 'jev' }).judge(otherSyndrome, meningitisCase),
    ).resolves.toMatchObject({
      fallback: 'jev_unconfigured',
      verdicts: [{ applies: false, reason: 'syndrome_mismatch' }],
    });
  });
});

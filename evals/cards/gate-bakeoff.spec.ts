import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { jevNoulBody, jevResponse } from '../../tests/fixtures/jev';
import { JevRelevanceGate } from '../../src/modules/knowledge-cards/card-retrieval/jev-relevance-gate';
import { TeiCardReranker } from '../../src/modules/knowledge-cards/card-retrieval/card-reranker';
import { RerankerRelevanceGate } from '../../src/modules/knowledge-cards/card-retrieval/reranker-relevance-gate';
import {
  renderBakeoffMarkdown,
  runBakeoff,
  scoredBakeoffGate,
  summarizeRun,
  thresholdBakeoffGate,
  type BakeoffGate,
  type BakeoffReportInput,
} from './gate-bakeoff';
import { groupBySituation, loadGateCards, loadGatePairs, type GatePair } from './gate-pairs';

/**
 * CC-407 — o bake-off sobre a semente, com os portões de produção e clientes
 * falsos: nenhuma chamada sai (nem à TypeSafe, nem a um reranker).
 */

const pairs = loadGatePairs(join(__dirname, 'gate-pairs.seed.json'));
const cards = new Map(
  loadGateCards(join(__dirname, 'gate-cards.seed.json')).map((card) => [card.cardId, card]),
);
const groups = groupBySituation(pairs);
const options = { maxUsd: 1, maxConsecutiveFailures: 3 };

/** Um relógio que anda 120 ms por leitura: latência determinística. */
function fakeClock() {
  let now = 0;
  return () => (now += 120);
}

/** O Jev falso "acerta": probabilidade alta para os pares relevantes da semente. */
function jevFetchFromLabels(probabilityFor: (pair: GatePair) => number) {
  const byStateKey = new Map<string, number>();
  for (const pair of pairs) {
    const card = cards.get(pair.cardId)!;
    byStateKey.set(`${pair.situation.text}|${card.topic}`, probabilityFor(pair));
  }
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { state } = JSON.parse(String(init.body)) as {
      state: {
        situacao: { hipoteses: string[]; entendimento: string | null };
        cartao: { tema: string };
      };
    };
    const text = state.situacao.entendimento ?? state.situacao.hipoteses[0];
    return jevResponse(
      jevNoulBody(byStateKey.get(`${text}|${state.cartao.tema}`) ?? 0.5, 'card_applies', 200),
    );
  });
}

function jevGate(fetchImpl: ReturnType<typeof vi.fn>, env: Record<string, string> = {}) {
  const config = new ConfigService({ JEV_API_KEY: 'chave-de-teste', ...env });
  return scoredBakeoffGate(
    'jev',
    new JevRelevanceGate(config, fetchImpl as unknown as typeof fetch),
    0.8,
    'sem JEV_API_KEY',
  );
}

function report(overrides: Partial<BakeoffReportInput> = {}): BakeoffReportInput {
  return {
    generatedAt: '2026-10-15T12:00:00.000Z',
    pairsFile: 'evals/cards/gate-pairs.seed.json',
    cardsSource: '`evals/cards/gate-cards.seed.json`',
    pairs: pairs.length,
    relevant: 6,
    seedPairs: pairs.length,
    labelers: ['semente'],
    minPrecision: 0.9,
    maxUsd: 1,
    spentUsd: 0,
    summaries: [],
    runs: [],
    ...overrides,
  };
}

describe('bake-off do portão de relevância (CC-407)', () => {
  it('o portão por limiar julga a semente: o limiar de hoje deixa a dengue entrar no cartão de meningite', async () => {
    const { runs } = await runBakeoff(groups, cards, [thresholdBakeoffGate(0.5)], options);
    const summary = summarizeRun(runs[0]!, 0.9);

    expect(summary).toMatchObject({ kind: 'threshold', judged: 20, total: 20, failures: 0 });
    expect(summary.current.counts).toEqual({
      truePositive: 6,
      falsePositive: 1,
      falseNegative: 0,
      trueNegative: 13,
    });
    expect(
      runs[0]!.pairs.find((pair) => pair.pairId === 'semente-dengue-alarme-x-meningite')?.score,
    ).toBe(0.52);
    // Síndrome diferente zera o escore, mesmo com similaridade 0,58.
    expect(
      runs[0]!.pairs.find((pair) => pair.pairId === 'semente-hsa-cefaleia-subita-x-meningite')
        ?.score,
    ).toBe(0);
    expect(summary.suggested).toMatchObject({ threshold: 0.74 });
    expect(summary.meetsTarget).toBe(true);
  });

  it('o por limiar não julga par sem similaridade', async () => {
    const withoutSimilarity = groupBySituation(
      pairs.map((pair, index) => (index === 0 ? { ...pair, similarity: null } : pair)),
    );

    const { runs } = await runBakeoff(
      withoutSimilarity,
      cards,
      [thresholdBakeoffGate(0.5)],
      options,
    );

    expect(summarizeRun(runs[0]!, 0.9)).toMatchObject({ judged: 19, total: 20 });
  });

  it('roda o Jev de produção com fetch falso: escores, latência por situação e custo pelos tokens', async () => {
    const fetchImpl = jevFetchFromLabels((pair) => (pair.label === 'relevant' ? 0.93 : 0.07));

    const { runs, spentUsd } = await runBakeoff(
      groups,
      cards,
      [jevGate(fetchImpl)],
      options,
      fakeClock(),
    );
    const summary = summarizeRun(runs[0]!, 0.9);

    expect(fetchImpl).toHaveBeenCalledTimes(20);
    expect(summary).toMatchObject({
      judged: 20,
      meetsTarget: true,
      brier: expect.closeTo(0.0049, 4),
    });
    expect(summary.latency).toEqual({ calls: 10, p50: 120, p95: 120 });
    // 20 chamadas × 200 tokens × US$ 0,042 / milhão.
    expect(runs[0]!.inputTokens).toBe(4000);
    expect(spentUsd).toBeCloseTo(0.000168, 9);
    expect(runs[0]!.costEstimated).toBe(false);
  });

  it('roda o reranker de produção com fetch falso, numa chamada por situação', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const { texts } = JSON.parse(String(init.body)) as { texts: string[] };
      return new Response(JSON.stringify(texts.map((_text, index) => ({ index, score: 0.4 }))));
    });
    const config = new ConfigService({ CARD_RERANKER_URL: 'http://reranker' });
    const gate = scoredBakeoffGate(
      'reranker',
      new RerankerRelevanceGate(
        config,
        new TeiCardReranker(config, fetchImpl as unknown as typeof fetch),
      ),
      0.5,
      'sem CARD_RERANKER_URL',
    );

    const { runs, spentUsd } = await runBakeoff(groups, cards, [gate], options);

    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(summarizeRun(runs[0]!, 0.9)).toMatchObject({ judged: 20, costUsd: 0, suggested: null });
    expect(spentUsd).toBe(0);
  });

  it('sem chave, o portão não roda e nada sai', async () => {
    const fetchImpl = vi.fn();
    const config = new ConfigService({});
    const gate = scoredBakeoffGate(
      'jev',
      new JevRelevanceGate(config, fetchImpl as unknown as typeof fetch),
      0.8,
      'sem JEV_API_KEY',
    );

    const { runs } = await runBakeoff(groups, cards, [gate], options);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(runs[0]).toMatchObject({
      stopped: { reason: 'unavailable', detail: 'sem JEV_API_KEY' },
    });
    expect(runs[0]!.pairs.every((pair) => pair.score === null)).toBe(true);
  });

  it('para antes de passar do teto de gasto (--max-usd)', async () => {
    const fetchImpl = jevFetchFromLabels(() => 0.5);
    const gate = jevGate(fetchImpl);
    const perSituation =
      (gate.estimateInputTokens(
        groups[0]!.pairs.map((pair) => ({ card: cards.get(pair.cardId)!, similarity: 0 })),
        groups[0]!.context,
      ) *
        0.042) /
      1_000_000;

    const { runs, spentUsd } = await runBakeoff(groups, cards, [gate], {
      ...options,
      maxUsd: perSituation * 2.5,
    });

    expect(runs[0]!.stopped?.reason).toBe('max_usd');
    expect(spentUsd).toBeLessThanOrEqual(perSituation * 2.5);
    expect(fetchImpl.mock.calls.length).toBeLessThan(20);
  });

  it('o teto vale para a soma dos portões: o segundo não roda com o orçamento gasto', async () => {
    const first = jevGate(jevFetchFromLabels(() => 0.5));
    const secondFetch = jevFetchFromLabels(() => 0.5);

    const { runs } = await runBakeoff(groups, cards, [first, jevGate(secondFetch)], {
      ...options,
      maxUsd: 0.00009,
    });

    expect(runs[1]!.stopped?.reason).toBe('max_usd');
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it.each([429, 402])(
    'para no limite de uso do provedor (HTTP %i), sem insistir',
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(jevResponse({ error: 'limite' }, status));

      const { runs } = await runBakeoff(groups, cards, [jevGate(fetchImpl)], options);

      expect(runs[0]).toMatchObject({
        failures: 1,
        stopped: { reason: 'usage_limit', detail: `Jev http ${status}` },
      });
      expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(2);
    },
  );

  it('para depois de falhas seguidas; falha isolada só perde aquela situação', async () => {
    const down = vi.fn().mockResolvedValue(jevResponse({}, 529));
    const { runs: downRuns } = await runBakeoff(groups, cards, [jevGate(down)], options);
    expect(downRuns[0]).toMatchObject({ failures: 3, stopped: { reason: 'failures' } });

    let call = 0;
    const flaky = jevFetchFromLabels(() => 0.9);
    const once = vi.fn(async (url: string, init: RequestInit) =>
      ++call <= 2 ? jevResponse({}, 529) : flaky(url, init),
    );
    const { runs } = await runBakeoff(groups, cards, [jevGate(once)], options);
    expect(runs[0]).toMatchObject({ failures: 1, stopped: null });
    expect(summarizeRun(runs[0]!, 0.9).judged).toBe(18);
  });

  it('o relatório avisa da semente e não traz o texto das situações', async () => {
    const gates: BakeoffGate[] = [thresholdBakeoffGate(0.5), jevGate(vi.fn(), { JEV_API_KEY: '' })];
    const { runs } = await runBakeoff(groups, cards, gates, options);

    const markdown = renderBakeoffMarkdown(
      report({ runs, summaries: runs.map((run) => summarizeRun(run, 0.9)) }),
    );

    expect(markdown).toContain('**não rotulados por médico**');
    expect(markdown).toContain('REVIEWED_CARDS_MIN_SIMILARITY=0.500');
    expect(markdown).toContain('`semente-dengue-alarme-x-meningite` (0.520)');
    expect(markdown).toContain('não rodou: sem JEV_API_KEY');
    for (const pair of pairs) expect(markdown).not.toContain(pair.situation.text);
  });

  it('sem semente, sem o aviso', () => {
    expect(renderBakeoffMarkdown(report({ seedPairs: 0 }))).not.toContain('semente sintética');
  });
});

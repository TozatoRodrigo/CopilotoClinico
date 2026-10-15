import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { jevNoulBody, jevResponse } from '../../../../tests/fixtures/jev';
import { anaphylaxisCard } from '../../../../tests/fixtures/quick-question';
import { reviewedCard } from '../../../../tests/fixtures/reviewed-cards';
import type { CardRelevanceContext } from './card-relevance-gate';
import { JEV_CARD_GATE_QUESTION, JevRelevanceGate } from './jev-relevance-gate';

/**
 * CC-407 — o portão do Jev (TypeSafe). Nenhum teste chama a API: o `fetch` é
 * falso, no formato Noul da documentação pública (docs.typesafe.ai).
 */

const QUESTION_ID = 'card_applies';
const CPF = '529.982.247-25';

const meningitisCase: CardRelevanceContext = {
  syndrome: 'febre',
  hypotheses: ['Meningite bacteriana', 'Hemorragia subaracnóidea'],
  problemRepresentation: `Adulto com febre, cefaleia e rigidez de nuca há 12 horas. CPF ${CPF}`,
};

describe('JevRelevanceGate (CC-407)', () => {
  let env: Record<string, string>;
  let fetchImpl: ReturnType<typeof vi.fn>;

  function gate() {
    return new JevRelevanceGate(new ConfigService(env), fetchImpl as unknown as typeof fetch);
  }

  /** A probabilidade de cada cartão, pelo tema que foi no `state`. */
  function answerByTopic(probabilities: Record<string, number>) {
    fetchImpl.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { state: { cartao: { tema: string } } };
      return jevResponse(jevNoulBody(probabilities[body.state.cartao.tema] ?? 0, QUESTION_ID));
    });
  }

  beforeEach(() => {
    env = { JEV_API_KEY: 'chave-de-teste' };
    fetchImpl = vi.fn();
  });

  it('pergunta "o cartão se aplica?" com o entendimento mascarado e o cartão, sem revisor nem fonte', async () => {
    answerByTopic({ 'Meningite bacteriana': 0.94 });

    await gate().judge([{ card: reviewedCard(), similarity: 0.8 }], meningitisCase);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(String(init.body));
    expect(body.questions).toEqual({ [QUESTION_ID]: JEV_CARD_GATE_QUESTION });
    expect(body.state.situacao).toEqual({
      sindrome: 'febre',
      hipoteses: ['Meningite bacteriana', 'Hemorragia subaracnóidea'],
      entendimento: 'Adulto com febre, cefaleia e rigidez de nuca há 12 horas. CPF [REDACTED_CPF]',
    });
    expect(body.state.cartao).toMatchObject({
      tema: 'Meningite bacteriana',
      sindrome: 'febre',
      pergunta: reviewedCard().content.question,
    });
    const sent = String(init.body);
    expect(sent).not.toContain(CPF);
    expect(sent).not.toContain('Ana Souza');
    expect(sent).not.toContain('pcdt-meningite.pdf');
  });

  it('aplica só o cartão com probabilidade ≥ o limiar (padrão 0,8)', async () => {
    answerByTopic({ 'Meningite bacteriana': 0.91, 'Anafilaxia: adrenalina IM': 0.62 });

    const judgement = await gate().judge(
      [
        { card: reviewedCard(), similarity: 0.8 },
        { card: anaphylaxisCard(), similarity: 0.55 },
      ],
      meningitisCase,
    );

    expect(judgement).toEqual({
      gate: 'jev',
      fallback: null,
      verdicts: [
        { cardId: reviewedCard().cardId, applies: true, reason: 'applies', score: 0.91 },
        { cardId: anaphylaxisCard().cardId, applies: false, reason: 'gate_rejected', score: 0.62 },
      ],
    });
  });

  it('o limiar vem do ambiente; valor inválido cai no padrão', async () => {
    answerByTopic({ 'Meningite bacteriana': 0.7 });
    const candidates = [{ card: reviewedCard(), similarity: 0.8 }];

    env = { ...env, CARD_GATE_JEV_MIN_PROBABILITY: '0.65' };
    expect((await gate().judge(candidates, meningitisCase)).verdicts[0]?.applies).toBe(true);

    env = { ...env, CARD_GATE_JEV_MIN_PROBABILITY: '1.5' };
    expect((await gate().judge(candidates, meningitisCase)).verdicts[0]?.applies).toBe(false);
  });

  it('uma chamada por candidato, e soma os tokens para o custo', async () => {
    answerByTopic({ 'Meningite bacteriana': 0.9, 'Anafilaxia: adrenalina IM': 0.1 });

    const scores = await gate().score(
      [
        { card: reviewedCard(), similarity: 0.8 },
        { card: anaphylaxisCard(), similarity: 0.5 },
      ],
      meningitisCase,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(scores).toMatchObject({ scores: [0.9, 0.1], model: 'jev-1.13.0', inputTokens: 240 });
  });

  it('estima os tokens antes de chamar e informa o preço por milhão', () => {
    const estimate = gate().estimateInputTokens(
      [{ card: reviewedCard(), similarity: 0.8 }],
      meningitisCase,
    );

    expect(estimate).toBeGreaterThan(100);
    expect(gate().usdPerMillionInputTokens).toBe(0.042);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sem candidatos, sem chamada', async () => {
    await expect(gate().judge([], meningitisCase)).resolves.toEqual({
      gate: 'jev',
      fallback: null,
      verdicts: [],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sem JEV_API_KEY não roda; uma falha derruba o lote inteiro', async () => {
    env = {};
    expect(gate().configured()).toBe(false);
    await expect(
      gate().judge([{ card: reviewedCard(), similarity: 0.8 }], meningitisCase),
    ).rejects.toThrow('JEV_API_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();

    env = { JEV_API_KEY: 'k' };
    fetchImpl
      .mockResolvedValueOnce(jevResponse(jevNoulBody(0.9, QUESTION_ID)))
      .mockResolvedValueOnce(jevResponse({}, 529));
    await expect(
      gate().judge(
        [
          { card: reviewedCard(), similarity: 0.8 },
          { card: anaphylaxisCard(), similarity: 0.5 },
        ],
        meningitisCase,
      ),
    ).rejects.toThrow('Jev http 529');
  });
});

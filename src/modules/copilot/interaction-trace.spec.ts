import { describe, it, expect } from 'vitest';
import { extractUnderstandingSignals } from './interaction-trace';

/**
 * CC-703 — síndrome e consultas do entendimento, o formato da lacuna
 * (CC-409). Lido de JSON gravado sem re-validação: o que não reconhece vira
 * vazio, nunca derruba quem chama.
 */
describe('extractUnderstandingSignals', () => {
  it('lê a síndrome e as consultas da busca dirigida', () => {
    expect(
      extractUnderstandingSignals({
        understanding: { syndrome: 'dor-toracica', searchQueries: [' IAM sem supra ', 'TEP'] },
      }),
    ).toEqual({ syndrome: 'dor-toracica', searchQueries: ['IAM sem supra', 'TEP'] });
  });

  it('mascara identificador copiado para a consulta e respeita os tetos', () => {
    const signals = extractUnderstandingSignals({
      understanding: {
        syndrome: 'febre',
        searchQueries: ['dengue CPF 529.982.247-25', '', 'x'.repeat(300), 'b', 'c', 'd'],
      },
    });

    expect(signals.searchQueries).toEqual(['dengue CPF [REDACTED_CPF]', 'x'.repeat(200), 'b', 'c']);
  });

  it.each([
    ['sem entendimento', { reasoning: 'texto' }],
    ['entendimento nulo (etapa falhou)', { understanding: null }],
    ['JSON que não é objeto', 'texto'],
  ])('devolve vazio %s', (_label, rawOutput) => {
    expect(extractUnderstandingSignals(rawOutput)).toEqual({ syndrome: null, searchQueries: [] });
  });

  it('descarta só a síndrome fora da lista, mantendo as consultas', () => {
    expect(
      extractUnderstandingSignals({
        understanding: { syndrome: 'inventada', searchQueries: ['vertigem central'] },
      }),
    ).toEqual({ syndrome: null, searchQueries: ['vertigem central'] });
  });
});

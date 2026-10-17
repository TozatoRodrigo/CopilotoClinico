import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cosine,
  judgeQuestion,
  loadRetrievalQuestions,
  rankCards,
  scoreRetrieval,
  unknownExpectations,
  type CardVector,
} from './retrieval-scoring';

/**
 * Fake de embedding por palavra-chave: uma dimensão por termo. Basta para o
 * ranking ter um vencedor previsível, sem nenhuma chamada de rede.
 */
const TERMS = ['meningite', 'ceftriaxona', 'anafilaxia', 'adrenalina', 'escorpiao'];
function fakeEmbed(text: string): number[] {
  const normalized = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return TERMS.map((term) => (normalized.includes(term) ? 1 : 0));
}

const CARDS: CardVector[] = [
  { cardId: 'c-men', topic: 'Meningite bacteriana', vector: fakeEmbed('meningite ceftriaxona') },
  { cardId: 'c-ana', topic: 'Anafilaxia', vector: fakeEmbed('anafilaxia adrenalina') },
  { cardId: 'c-esc', topic: 'Escorpionismo', vector: fakeEmbed('escorpião') },
];

describe('busca nos cartões — gabarito (CC-406)', () => {
  it('cosseno: 1 para o mesmo sentido, 0 sem termo em comum ou vetor nulo', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(() => cosine([1], [1, 0])).toThrow('dimensões diferentes');
  });

  it('acha o cartão da pergunta com o fake de embedding', () => {
    const ranked = rankCards(fakeEmbed('Dose de ceftriaxona na meningite?'), CARDS);

    expect(ranked[0]).toMatchObject({ cardId: 'c-men', topic: 'Meningite bacteriana' });
    expect(ranked[0]!.similarity).toBeGreaterThan(ranked[1]!.similarity);
  });

  it('pontua acerto no top-1, no top-k e o MRR, por tema (sem caixa) ou id', () => {
    const questions = [
      {
        id: 'q1',
        question: 'Dose de ceftriaxona na meningite?',
        expected: ['meningite bacteriana'],
      },
      { id: 'q2', question: 'Adrenalina na anafilaxia?', expected: ['c-ana'] },
      { id: 'q3', question: 'Picada de escorpião?', expected: ['Tétano'] },
    ];
    const results = questions.map((question) =>
      judgeQuestion(question, rankCards(fakeEmbed(question.question), CARDS), 3),
    );

    const score = scoreRetrieval(results, 3);

    expect(results.map((result) => result.rank)).toEqual([1, 1, null]);
    expect(score).toMatchObject({ total: 3, k: 3, hitAt1: 2 / 3, hitAtK: 2 / 3, mrr: 2 / 3 });
    expect(score.misses.map((miss) => miss.id)).toEqual(['q3']);
    expect(score.misses[0]!.topK).toHaveLength(3);
  });

  it('conta como erro o cartão esperado fora do top-k', () => {
    const result = judgeQuestion(
      { id: 'q', question: 'x', expected: ['Escorpionismo'] },
      rankCards(fakeEmbed('meningite anafilaxia'), CARDS),
      1,
    );

    expect(result.rank).toBe(3);
    expect(scoreRetrieval([result], 1)).toMatchObject({ hitAtK: 0, mrr: 1 / 3 });
  });

  it('acusa expectativa que não casa com cartão publicado nenhum', () => {
    expect(
      unknownExpectations(
        [{ id: 'q', question: 'pergunta', expected: ['Anafilaxia', 'Tétano', 'c-men'] }],
        CARDS,
      ),
    ).toEqual(['q: "Tétano"']);
  });

  it('valida o arquivo de perguntas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc406-'));
    const valid = join(dir, 'ok.json');
    writeFileSync(
      valid,
      JSON.stringify({ questions: [{ id: 'q-1', question: 'Dose?', expected: ['Anafilaxia'] }] }),
    );
    expect(loadRetrievalQuestions(valid)).toHaveLength(1);

    const repeated = join(dir, 'repetido.json');
    writeFileSync(
      repeated,
      JSON.stringify({
        questions: [
          { id: 'q-1', question: 'Dose de algo?', expected: ['A'] },
          { id: 'q-1', question: 'Outra dose?', expected: ['B'] },
        ],
      }),
    );
    expect(() => loadRetrievalQuestions(repeated)).toThrow('ids de pergunta repetidos');
  });

  it('o exemplo versionado é válido', () => {
    const questions = loadRetrievalQuestions(join(__dirname, 'retrieval-questions.example.json'));
    expect(questions.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { rankCards, scoreCard, type CardSearchCandidate } from './card-matching';

function candidate(overrides: Partial<CardSearchCandidate> = {}): CardSearchCandidate {
  return {
    id: 'card-1',
    topic: 'Anafilaxia no adulto',
    question: 'Qual a dose de adrenalina intramuscular na anafilaxia?',
    syndrome: 'reacao-alergica',
    sourceKey: null,
    ...overrides,
  };
}

const NORADRENALINE = candidate({
  id: 'nora',
  topic: 'Noradrenalina em infusão contínua',
  question: 'Qual a dose de Noradrenalina em infusão contínua no adulto?',
  syndrome: 'choque',
  sourceKey: 'any:infusoes/noradrenalina',
});

describe('busca textual dos cartões no ⌘K (CC-502)', () => {
  it('acha pelo tema, sem acento nem caixa', () => {
    expect(scoreCard(candidate(), 'ANAFILAXIA')).toBeGreaterThan(0);
    expect(scoreCard(NORADRENALINE, 'infusao continua')).toBeGreaterThan(0);
  });

  it('acha pela pergunta e pela síndrome', () => {
    expect(scoreCard(candidate(), 'intramuscular')).toBeGreaterThan(0);
    expect(scoreCard(candidate(), 'urticária')).toBeGreaterThan(0);
  });

  it('acha o cartão importado do ANY pelo sinônimo do item no motor', () => {
    expect(scoreCard(NORADRENALINE, 'nora')).toBeGreaterThan(0);
    expect(scoreCard(NORADRENALINE, 'levophed')).toBeGreaterThan(0);
    expect(scoreCard(NORADRENALINE, 'Infusões contínuas')).toBeGreaterThan(0);
  });

  it('cartão que não é do ANY não herda sinônimo', () => {
    expect(scoreCard({ ...NORADRENALINE, sourceKey: null }, 'levophed')).toBe(0);
  });

  it('toda palavra da busca precisa aparecer', () => {
    expect(scoreCard(candidate(), 'anafilaxia criança')).toBe(0);
    expect(scoreCard(candidate(), '')).toBe(0);
  });

  it('tema que começa com a busca vem antes de pergunta que a contém', () => {
    const byQuestion = candidate({
      id: 'por-pergunta',
      topic: 'Reação alérgica grave',
      question: 'Quando a anafilaxia pede adrenalina?',
    });
    const byTopic = candidate({ id: 'por-tema' });

    expect(rankCards([byQuestion, byTopic], 'anafilaxia').map(({ id }) => id)).toEqual([
      'por-tema',
      'por-pergunta',
    ]);
  });

  it('deixa de fora o que não casa', () => {
    expect(rankCards([candidate(), NORADRENALINE], 'nora').map(({ id }) => id)).toEqual(['nora']);
  });
});

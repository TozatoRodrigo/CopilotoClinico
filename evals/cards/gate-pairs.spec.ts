import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { anaphylaxisCard } from '../../tests/fixtures/quick-question';
import { reviewedCard } from '../../tests/fixtures/reviewed-cards';
import {
  groupBySituation,
  loadGateCards,
  loadGatePairs,
  missingCards,
  situationContext,
  type GatePair,
} from './gate-pairs';

const SEED_PAIRS = join(__dirname, 'gate-pairs.seed.json');
const SEED_CARDS = join(__dirname, 'gate-cards.seed.json');

describe('pares do bake-off do portão (CC-407)', () => {
  let dir: string | null = null;

  function file(content: unknown): string {
    dir ??= mkdtempSync(join(tmpdir(), 'gate-pairs-'));
    const path = join(dir, `pairs-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(path, JSON.stringify(content));
    return path;
  }

  function pair(overrides: Record<string, unknown> = {}) {
    return {
      id: 'p1',
      situation: { kind: 'case', text: 'Adulto com febre e rigidez de nuca', syndrome: 'febre' },
      cardId: 'c1',
      label: 'relevant',
      labeler: { kind: 'physician', id: 'AS CRM-SP' },
      ...overrides,
    };
  }

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('a semente tem ~20 pares sintéticos, marcados como não rotulados por médico', () => {
    const pairs = loadGatePairs(SEED_PAIRS);

    expect(pairs).toHaveLength(20);
    expect(pairs.every((seed) => seed.labeler.kind === 'seed')).toBe(true);
    expect(pairs.filter((seed) => seed.label === 'relevant')).toHaveLength(6);
    expect(new Set(pairs.map((seed) => seed.situation.kind))).toEqual(
      new Set(['case', 'quick_question']),
    );
  });

  it('os cartões da semente são os cartões de teste, só com o que o portão lê', () => {
    const relevanceFields = (card: ReturnType<typeof reviewedCard>) => ({
      cardId: card.cardId,
      topic: card.topic,
      syndrome: card.syndrome,
      content: {
        question: card.content.question,
        population: card.content.population,
        answer: card.content.answer,
        claims: card.content.claims.map((claim) => ({ text: claim.text })),
      },
    });

    expect(loadGateCards(SEED_CARDS)).toEqual([
      relevanceFields(reviewedCard()),
      relevanceFields(anaphylaxisCard()),
    ]);
    const cards = new Map(loadGateCards(SEED_CARDS).map((card) => [card.cardId, card]));
    expect(missingCards(loadGatePairs(SEED_PAIRS), cards)).toEqual([]);
  });

  it('a situação vai ao portão como na análise e na pergunta rápida', () => {
    expect(
      situationContext({
        kind: 'case',
        text: 'Adulto com febre',
        syndrome: 'febre',
        hypotheses: ['Meningite bacteriana'],
      }),
    ).toEqual({
      syndrome: 'febre',
      hypotheses: ['Meningite bacteriana'],
      problemRepresentation: 'Adulto com febre',
    });
    expect(
      situationContext({
        kind: 'quick_question',
        text: 'Dose de adrenalina?',
        syndrome: null,
        hypotheses: [],
      }),
    ).toEqual({ syndrome: null, hypotheses: ['Dose de adrenalina?'], problemRepresentation: null });
  });

  it('agrupa os pares da mesma situação numa chamada só', () => {
    const pairs = loadGatePairs(SEED_PAIRS);

    const groups = groupBySituation(pairs);

    expect(groups).toHaveLength(10);
    expect(groups.every((group) => group.pairs.length === 2)).toBe(true);
  });

  it('recusa texto com dado pessoal: o arquivo é versionado e vai para o Jev', () => {
    const path = file({
      pairs: [
        pair({
          situation: {
            kind: 'case',
            text: 'Paciente CPF 529.982.247-25 com febre',
            syndrome: null,
          },
        }),
      ],
    });

    expect(() => loadGatePairs(path)).toThrow('dado pessoal no texto da situação');
  });

  it.each<[string, unknown]>([
    ['rótulo fora da lista', { pairs: [pair({ label: 'talvez' })] }],
    ['rotulador sem identificação', { pairs: [pair({ labeler: { kind: 'physician' } })] }],
    ['ids repetidos', { pairs: [pair(), pair()] }],
    [
      'pergunta rápida com síndrome',
      {
        pairs: [pair({ situation: { kind: 'quick_question', text: 'Dose?', syndrome: 'febre' } })],
      },
    ],
    ['campo desconhecido', { pairs: [pair({ caseText: 'texto bruto do caso' })] }],
  ])('recusa arquivo inválido: %s', (_case, content) => {
    expect(() => loadGatePairs(file(content))).toThrow('inválido');
  });

  it('aceita par de médico sem similaridade', () => {
    const [loaded] = loadGatePairs(file({ pairs: [pair()] })) as [GatePair];

    expect(loaded).toMatchObject({ similarity: null, labeler: { kind: 'physician' } });
  });
});

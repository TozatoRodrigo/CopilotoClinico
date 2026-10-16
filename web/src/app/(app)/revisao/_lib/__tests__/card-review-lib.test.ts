import { describe, expect, it } from 'vitest';
import type { KnowledgeCardContent } from '@contracts/knowledge-cards';
import { diffCardContent, diffWords } from '../card-diff';
import { fieldId, issueLabel, issuesAt, parseContentIssues, toContentInput } from '../card-editor';
import { createVisibleTimer, formatElapsed, MAX_REVIEW_DURATION_MS } from '../review-timer';
import { reviewContent } from '../../__tests__/fixtures';

describe('diffWords', () => {
  it('marca as palavras removidas e incluídas e preserva o resto', () => {
    expect(diffWords('Ceftriaxona 2 g a cada 12 horas', 'Ceftriaxona 2 g a cada 24 horas')).toEqual(
      [
        { kind: 'same', text: 'Ceftriaxona 2 g a cada ' },
        { kind: 'removed', text: '12' },
        { kind: 'added', text: '24' },
        { kind: 'same', text: ' horas' },
      ],
    );
  });

  it('texto novo inteiro quando antes era vazio', () => {
    expect(diffWords('', 'adulto sem choque')).toEqual([
      { kind: 'added', text: 'adulto sem choque' },
    ]);
  });
});

describe('diffCardContent', () => {
  it('sem mudança, sem diff', () => {
    expect(diffCardContent(reviewContent(), reviewContent())).toEqual([]);
  });

  it('aponta campo a campo o que a correção mudou, inclusive a dose', () => {
    const before = reviewContent();
    const after = reviewContent();
    after.answer = 'Ceftriaxona 2 g IV a cada 12 horas, logo após a coleta do líquor.';
    after.claims[0]!.dose!.maxDose = null;

    expect(diffCardContent(before, after).map((change) => change.label)).toEqual([
      'Resposta',
      'O que fazer agora 1 · dose',
    ]);
  });

  it('afirmação removida aparece como removida, sem embaralhar as outras', () => {
    const before = reviewContent();
    const after = reviewContent();
    after.claims = [after.claims[1]!];

    expect(diffCardContent(before, after)).toEqual([
      {
        label: 'O que fazer agora 1 (removida)',
        before: before.claims[0]!.text,
        after: '',
      },
    ]);
  });
});

describe('editor da correção', () => {
  it('manda as fontes só como chave e trecho, e copia o resto', () => {
    const content: KnowledgeCardContent = reviewContent();
    const input = toContentInput(content);

    expect(input.sources).toEqual([
      { key: 'S1', chunkId: content.sources[0]!.chunkId },
      { key: 'S2', chunkId: content.sources[1]!.chunkId },
    ]);
    input.claims[0]!.dose!.amount = '4 g';
    expect(content.claims[0]!.dose!.amount).toBe('2 g');
  });

  it('lê os problemas do 422 e ignora corpo de outro formato', () => {
    const issues = [{ path: 'claims[0].dose.amount', message: 'dose sem fonte' }];
    expect(parseContentIssues({ message: 'x', issues })).toEqual(issues);
    expect(parseContentIssues({ message: 'x' })).toBeNull();
    expect(parseContentIssues('erro')).toBeNull();
  });

  it('acha os problemas de um campo e dos campos dentro dele', () => {
    const issues = [
      { path: 'claims[0].dose.amount', message: 'a' },
      { path: 'claims[0].dose.citation.quote', message: 'b' },
      { path: 'claims[1].text', message: 'c' },
    ];
    expect(issuesAt(issues, 'claims[0].dose').map((issue) => issue.message)).toEqual(['a', 'b']);
    expect(issuesAt(issues, 'claims[1]').map((issue) => issue.message)).toEqual(['c']);
    expect(issuesAt(issues, 'claims[0].dose.amount')).toHaveLength(1);
  });

  it('dá nome legível e id estável ao caminho', () => {
    expect(issueLabel('claims[1].dose.amount')).toBe('Afirmação 2 · dose · quantidade');
    expect(issueLabel('answerCitations[0].quote')).toBe('Citação da resposta 1 · trecho citado');
    expect(fieldId('claims[1].dose.amount')).toBe('card-field-claims-1-dose-amount');
  });
});

describe('cronômetro da revisão', () => {
  it('conta só o tempo com a tela visível', () => {
    let now = 0;
    const timer = createVisibleTimer(() => now, true);

    now = 30_000;
    timer.pause();
    now = 90_000; // celular bloqueado atendendo um paciente
    timer.resume();
    now = 100_000;

    expect(timer.elapsedMs()).toBe(40_000);
  });

  it('aberto com a aba escondida, só começa ao aparecer', () => {
    let now = 5_000;
    const timer = createVisibleTimer(() => now, false);
    now = 8_000;
    timer.resume();
    now = 9_500;

    expect(timer.elapsedMs()).toBe(1_500);
  });

  it('não passa do teto que a API aceita', () => {
    let now = 0;
    const timer = createVisibleTimer(() => now, true);
    now = 5 * 60 * 60 * 1000;

    expect(timer.elapsedMs()).toBe(MAX_REVIEW_DURATION_MS);
  });

  it('formata minutos e segundos', () => {
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(0)).toBe('0:00');
  });
});

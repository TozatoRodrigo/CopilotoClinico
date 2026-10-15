import { describe, expect, it } from 'vitest';
import { anyCardDrafts } from './any-card-catalog';
import type { AnyCardDraft } from './any-card-draft';
import {
  findingApplies,
  loadReviewFindings,
  parseCsv,
  parsePediatricDivergences,
  parseReviewFindings,
  reviewFlagsFor,
  type ReviewFindingsIndex,
} from './review-findings';

/**
 * CC-405 — o achado da revisão clínica (CC-310) chega ao cartão que ele cita,
 * para o revisor ver antes de assinar.
 */

const TABLE_DOC = `# Revisão clínica — Exemplo

## 1. Conteúdo clínico (decisão do revisor)

| #   | Onde                      | O que o ANY diz          | Por que parece problema | Opções   |
| --- | ------------------------- | ------------------------ | ----------------------- | -------- |
| 1.1 | Nitroglicerina, modo SCAPE | Faixa 1–10 mcg/kg/min.   | Alerta o tempo todo.    | (a) (b)  |
| 1.2 | Todas as drogas           | Abaixo do mínimo, vermelho | Parece dose crítica.  | (a)      |

## 2. Faixas de entrada definidas no porte

| #   | Onde | O que o ANY diz | Por que parece problema |
| --- | ---- | --------------- | ----------------------- |
| 2.1 | Peso | 40–200 kg       | Confirmar.              |
`;

const LIST_DOC = `# Revisão clínica — Pediatria

## Achados no conteúdo do PedGuide v4

1. **Drogas sem teto no cálculo.**
   - Onde: \`glicose\`, \`glicose-g10\`, \`manitol\`.
   - O que o ANY diz: glicose 10% 5 mL/kg; manitol
     0,5 g/kg.
   - Por que parece problema: as outras drogas têm teto.
   - Opções: definir teto.

2. **Formatação do checklist.**
   - O ANY mostra o tubo "e um menor".

## Diferenças de comportamento do porte

1. **Não é achado clínico.**
   - Onde: \`glicose\`.
`;

function draft(overrides: Partial<AnyCardDraft>): AnyCardDraft {
  const [base] = anyCardDrafts('infusoes');
  return { ...base!, ...overrides };
}

describe('parseReviewFindings', () => {
  it('lê a tabela só das seções de conteúdo clínico', () => {
    const findings = parseReviewFindings('infusoes.md', TABLE_DOC, /conteúdo clínico/i);
    expect(findings).toEqual([
      {
        doc: 'infusoes.md',
        id: '1.1',
        where: 'Nitroglicerina, modo SCAPE',
        detail: 'Faixa 1–10 mcg/kg/min. — Alerta o tempo todo.',
      },
      {
        doc: 'infusoes.md',
        id: '1.2',
        where: 'Todas as drogas',
        detail: 'Abaixo do mínimo, vermelho — Parece dose crítica.',
      },
    ]);
  });

  it('lê a lista numerada, com "Onde" e a continuação das linhas', () => {
    const findings = parseReviewFindings('pediatria.md', LIST_DOC, /achados no conteúdo/i);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      id: '1',
      where: 'glicose, glicose-g10, manitol.',
      detail: expect.stringContaining('manitol 0,5 g/kg'),
    });
    expect(findings[1]).toMatchObject({ id: '2', where: 'Formatação do checklist.' });
  });

  it('os documentos reais têm achados para todas as ferramentas importadas', () => {
    const index = loadReviewFindings(process.cwd());
    for (const [toolId, findings] of index.byTool) {
      expect(findings.length, toolId).toBeGreaterThan(0);
    }
    expect(index.pediatric.size).toBeGreaterThan(0);
  });
});

describe('findingApplies', () => {
  const finding = (where: string) => ({ doc: 'x.md', id: '1', where, detail: '' });

  it('liga pelo nome ou id do item, com fronteira de palavra', () => {
    const glicose = draft({ findingTerms: ['glicose'] });
    expect(findingApplies(finding('`glicose`, `manitol`'), glicose)).toBe(true);
    // "glicose-g10" é outro item: o id com hífen não casa com "glicose".
    expect(findingApplies(finding('glicose-g10'), glicose)).toBe(false);
    expect(
      findingApplies(
        finding('Nitroglicerina, modo SCAPE'),
        draft({ findingTerms: ['Nitroglicerina'] }),
      ),
    ).toBe(true);
  });

  it('achado da ferramenta inteira vale para todo item', () => {
    const any = draft({ findingTerms: ['qualquer'] });
    expect(findingApplies(finding('Todas as drogas'), any)).toBe(true);
    expect(findingApplies(finding('Todo o roteiro'), any)).toBe(true);
    expect(findingApplies(finding('Ferramenta inteira'), any)).toBe(true);
    expect(findingApplies(finding('Peso'), any)).toBe(false);
  });
});

describe('reviewFlagsFor', () => {
  const index: ReviewFindingsIndex = {
    byTool: new Map([
      [
        'infusoes',
        [
          { doc: 'infusoes.md', id: '1.1', where: 'Nitroglicerina, modo SCAPE', detail: 'Faixa.' },
          { doc: 'infusoes.md', id: '1.6', where: 'Noradrenalina', detail: 'Teto de 3.' },
        ],
      ],
    ]),
    pediatric: parsePediatricDivergences(
      'tabela,id,diverge,divergencias,decisao_gustavo\n' +
        'bolus,epinefrina-iv,sim,"teto, concentração",\n' +
        'bolus,amiodarona,nao,—,\n',
    ),
  };

  it('conteúdo com revisão pendente no motor leva o aviso e os achados do item', () => {
    const nora = anyCardDrafts('infusoes').find(
      (item) => item.itemId === 'infusoes/noradrenalina',
    )!;
    const flags = reviewFlagsFor(nora, index);
    expect(nora.provenance.review.status).toBe('pendente');
    expect(flags.map((flag) => flag.ref)).toEqual([
      'docs/ferramentas/revisao-clinica/infusoes.md',
      'docs/ferramentas/revisao-clinica/infusoes.md#1.6',
    ]);
    expect(flags[1]).toMatchObject({ title: 'Achado 1.6: Noradrenalina', detail: 'Teto de 3.' });
  });

  it('conteúdo já revisado no motor e sem achado não leva aviso', () => {
    const nora = anyCardDrafts('infusoes').find((item) => item.itemId === 'infusoes/adrenalina')!;
    const reviewed = {
      ...nora,
      provenance: {
        ...nora.provenance,
        review: {
          status: 'revisado' as const,
          reviewer: 'X',
          crm: '1/SP',
          reviewedAt: '2026-10-15',
        },
      },
    };
    expect(reviewFlagsFor(reviewed, index)).toEqual([]);
  });

  it('na pediatria, a divergência do id na fonte única (CC-321)', () => {
    const epinefrina = anyCardDrafts('pediatria').find(
      (item) => item.itemId === 'pediatria/bolus-epinefrina-iv',
    )!;
    const amiodarona = anyCardDrafts('pediatria').find(
      (item) => item.itemId === 'pediatria/bolus-amiodarona',
    )!;
    expect(reviewFlagsFor(epinefrina, index).at(-1)).toMatchObject({
      ref: 'docs/ferramentas/revisao-clinica/pediatria-fonte-unica.md#epinefrina-iv',
      detail: 'Diverge em: teto, concentração. Sem decisão registrada.',
    });
    expect(reviewFlagsFor(amiodarona, index)).toHaveLength(1);
  });
});

describe('parseCsv', () => {
  it('respeita aspas com vírgula e aspas escapadas', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });
});

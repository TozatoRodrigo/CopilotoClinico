import { describe, expect, it } from 'vitest';
import { OVACE_STEP_IDS, OVACE_STEPS, type OvaceStepId } from './ovace';
import {
  HS_CAUSES,
  ROSC_CHECKLIST,
  ROSC_CHECKLIST_IDS,
  splitFirstSentence,
  TS_CAUSES,
} from './reversible-causes';

describe('roteiro de OVACE', () => {
  it('toda opção leva a um passo que existe', () => {
    for (const step of Object.values(OVACE_STEPS)) {
      for (const option of step.options) {
        if (option.target.kind === 'step') {
          expect(OVACE_STEP_IDS).toContain(option.target.step);
        }
      }
    }
  });

  it('todo passo é alcançável a partir da avaliação', () => {
    const reached = new Set<OvaceStepId>(['assessment']);
    const queue: OvaceStepId[] = ['assessment'];
    while (queue.length > 0) {
      const current = queue.shift() as OvaceStepId;
      for (const option of OVACE_STEPS[current].options) {
        if (option.target.kind === 'step' && !reached.has(option.target.step)) {
          reached.add(option.target.step);
          queue.push(option.target.step);
        }
      }
    }
    expect([...reached].sort()).toEqual([...OVACE_STEP_IDS].sort());
  });

  it('inconsciente oferece iniciar o código; expelido, sair', () => {
    expect(OVACE_STEPS.unconscious.options.map(({ target }) => target.kind)).toContain(
      'start-code',
    );
    expect(OVACE_STEPS.expelled.options.map(({ target }) => target.kind)).toEqual(['exit']);
  });
});

describe("H's e T's e checklist pós-RCE", () => {
  it("são 5 H's, 5 T's e 10 itens de checklist, sem id repetido", () => {
    expect(HS_CAUSES).toHaveLength(5);
    expect(TS_CAUSES).toHaveLength(5);
    const ids = [...HS_CAUSES, ...TS_CAUSES].map(({ id }) => id);
    expect(new Set(ids).size).toBe(10);
    expect(ROSC_CHECKLIST.map(({ id }) => id)).toEqual([...ROSC_CHECKLIST_IDS]);
  });

  it('só hipóxia e toxinas apontam para outra ferramenta', () => {
    expect(
      [...HS_CAUSES, ...TS_CAUSES].filter(({ link }) => link).map(({ id, link }) => [id, link]),
    ).toEqual([
      ['hipoxia', 'via-aerea'],
      ['toxinas', 'toxicologia'],
    ]);
  });

  it('destaca a primeira frase como o ANY', () => {
    expect(splitFirstSentence('FiO₂ 100%. Considerar IOT. Verificar posição do tubo.')).toEqual({
      lead: 'FiO₂ 100%.',
      rest: 'Considerar IOT. Verificar posição do tubo.',
    });
    expect(splitFirstSentence('Sem ponto')).toEqual({ lead: 'Sem ponto', rest: '' });
  });
});

/** Regra de linguagem do ADR-017, com os imperativos que o roteiro do ANY usava. */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva|Mantenha|Repita|Acione|Continue|Incentive|Avalie|Evite|Solicite)\b/;

describe('linguagem do pós-parada', () => {
  it('sugere ou descreve em vez de mandar', () => {
    const texts = [
      ...Object.values(OVACE_STEPS).flatMap((step) => [
        ...step.blocks.flatMap(({ title, text }) => [title, text ?? '']),
        step.note ?? '',
      ]),
      ...[...HS_CAUSES, ...TS_CAUSES].map(({ action }) => action),
      ...ROSC_CHECKLIST.map(({ text }) => text),
    ];
    for (const text of texts) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });
});

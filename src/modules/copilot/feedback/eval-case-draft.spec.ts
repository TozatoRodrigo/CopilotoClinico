import { describe, it, expect, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import { ClinicalCaseSchema, SYNDROME_GROUPS } from '../../../../evals/clinical/case.schema';
import {
  EVAL_CASE_DRAFT_PLACEHOLDER,
  type EvalCaseDraft,
} from '../../../shared/contracts/clinical';
import { maskPII } from '../guardrails/pii-filter';
import { buildEvalCaseDraft, type EvalCaseDraftSource } from './eval-case-draft';

const feedbackId = '1a2b3c4d-5555-4555-8555-555555555555';

const CASE_TEXT =
  'Adulto com febre há 4 dias, mialgia, dor retro-orbitária. Piorou na defervescência, ' +
  'dor abdominal e lipotímia. PA 96x64, FC 108. Plaquetas 98.000.';

function source(overrides: Partial<EvalCaseDraftSource['interaction']> = {}): EvalCaseDraftSource {
  return {
    feedback: {
      id: feedbackId,
      kind: 'wrong_scenario',
      comment: 'Era dengue, foi para sepse.',
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    interaction: {
      model: 'claude-sonnet',
      turnIndex: 0,
      inputRedacted: CASE_TEXT,
      answeredQuestions: null,
      params: { retrievalCoverage: 'partial', redFlags: { anticoagulant: false, elderly65: true } },
      rawOutput: {
        differentials: [{ hypothesis: 'Sepse de foco indeterminado' }],
        understanding: { syndrome: 'febre-hipotensao', searchQueries: ['sepse manejo inicial'] },
      },
      ...overrides,
    },
    encounterContext: { hasCT: true, isSus: true, hasLab: true, hasICU: false },
  };
}

/** A mesma validação do carregador do gabarito (evals/clinical/cases.ts). */
function expectValidCase(draft: EvalCaseDraft): void {
  const parsed = ClinicalCaseSchema.safeParse(JSON.parse(JSON.stringify(draft)));
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
}

/**
 * CC-703 — o reporte da triagem vira um caso que JÁ passa no schema do
 * gabarito v2, com o texto mascarado e o que é do curador marcado. O valor do
 * teste está em rodar o rascunho pelo schema REAL: se o gabarito mudar (campo
 * novo obrigatório), este teste quebra antes de o curador baixar um arquivo
 * que o carregador recusa.
 */
describe('buildEvalCaseDraft', () => {
  it('produz um caso válido no schema do gabarito v2, rastreável ao reporte', () => {
    const draft = buildEvalCaseDraft(source());

    expectValidCase(draft);
    expect(draft).toMatchObject({
      schemaVersion: 2,
      id: 'campo-1a2b3c4d',
      critical: false,
      goldSource: 'field_incident',
      review: { status: 'draft' },
      provenance: { origin: `feedback:${feedbackId}` },
    });
  });

  it('deixa as expectativas vazias e marca o que o curador precisa escrever', () => {
    const draft = buildEvalCaseDraft(source());

    expect(draft.expected).toMatchObject({
      diagnoses: [],
      actions: [],
      questions: [],
      forbiddenDefinitiveActions: [],
    });
    expect(draft.title).toContain(EVAL_CASE_DRAFT_PLACEHOLDER);
    expect(draft.expected.syndrome).toContain(EVAL_CASE_DRAFT_PLACEHOLDER);
    expect(draft.expected.rationale).toContain(EVAL_CASE_DRAFT_PLACEHOLDER);
    expect(draft.review.notes).toContain(EVAL_CASE_DRAFT_PLACEHOLDER);
  });

  describe('máscara', () => {
    it('mascara de novo o texto do caso e o comentário: o arquivo sai do sistema', () => {
      const draft = buildEvalCaseDraft({
        ...source({
          inputRedacted: `${CASE_TEXT} CPF 529.982.247-25, tel (11) 98765-4321.`,
        }),
        feedback: { ...source().feedback, comment: 'Paciente de CPF 529.982.247-25' },
      });

      expect(JSON.stringify(draft)).not.toContain('529.982.247-25');
      expect(JSON.stringify(draft)).not.toContain('98765-4321');
      expect(draft.input.caseText).toContain('[REDACTED_CPF]');
      expect(draft.input.caseText).toContain('[REDACTED_PHONE]');
      expect(draft.provenance.notes).toContain('Paciente de CPF [REDACTED_CPF]');
      // O gabarito exige que o caso chegue ao modelo como escrito, sem PII a mascarar.
      expect(maskPII(draft.input.caseText).hasPII).toBe(false);
      expectValidCase(draft);
    });

    it('mascara também as respostas do médico anexadas ao texto', () => {
      const draft = buildEvalCaseDraft(
        source({
          turnIndex: 1,
          answeredQuestions: [
            {
              questionId: 'q1',
              question: 'Há sangramento?',
              answer: 'Não; contato da filha (11) 98765-4321',
              turnIndex: 0,
            },
          ],
        }),
      );

      expect(draft.input.caseText).toContain('P: Há sangramento?');
      expect(draft.input.caseText).toContain('R: Não; contato da filha [REDACTED_PHONE]');
      expect(draft.input.caseText).not.toContain('98765-4321');
    });
  });

  describe('texto do caso', () => {
    it('reproduz o que o modelo leu: o caso e o bloco de respostas da rodada', () => {
      const draft = buildEvalCaseDraft(
        source({
          answeredQuestions: [
            { questionId: 'q1', question: 'Há sangramento?', answer: 'Não', turnIndex: 0 },
          ],
        }),
      );

      expect(draft.input.caseText).toBe(
        `${CASE_TEXT}\n\n--- Informações adicionais fornecidas pelo médico ---\nP: Há sangramento?\nR: Não`,
      );
    });

    it('ignora respostas gravadas num formato que não reconhece', () => {
      const draft = buildEvalCaseDraft(source({ answeredQuestions: { legado: true } }));

      expect(draft.input.caseText).toBe(CASE_TEXT);
    });

    it('corta no teto do gabarito (4000) e pede o resumo ao curador', () => {
      const draft = buildEvalCaseDraft(source({ inputRedacted: 'febre '.repeat(900) }));

      expect(draft.input.caseText.length).toBeLessThanOrEqual(4000);
      expect(draft.review.notes).toContain('foi cortado');
      expectValidCase(draft);
    });

    it('marca o texto a preencher quando a análise não o gravou', () => {
      for (const inputRedacted of [null, '', 'curto']) {
        const draft = buildEvalCaseDraft(source({ inputRedacted }));

        expect(draft.input.caseText).toContain(EVAL_CASE_DRAFT_PLACEHOLDER);
        expect(draft.review.notes).toContain('reescrever o caso');
        expectValidCase(draft);
      }
    });
  });

  describe('síndrome de PS (tags[0])', () => {
    it('usa a síndrome do entendimento da análise e pede só a conferência', () => {
      const draft = buildEvalCaseDraft(source());

      expect(draft.tags).toEqual(['febre-hipotensao', 'incidente-de-campo', 'cenario-errado']);
      expect(draft.review.notes).toContain('conferir tags[0]');
    });

    it.each([
      ['sem entendimento (modo legacy)', { differentials: [] }],
      ['síndrome "outro", que o gabarito não aceita', { understanding: { syndrome: 'outro' } }],
      ['síndrome fora da lista', { understanding: { syndrome: 'dor-no-dedo' } }],
    ])('com %s, usa uma provisória marcada a preencher', (_label, rawOutput) => {
      const draft = buildEvalCaseDraft(source({ rawOutput }));

      expect(SYNDROME_GROUPS).toContain(draft.tags[0]);
      expect(draft.tags).toContain('a-preencher');
      expect(draft.review.notes).toContain('provisória');
      expectValidCase(draft);
    });
  });

  it('leva os recursos do serviço e só as bandeiras de alerta marcadas', () => {
    const draft = buildEvalCaseDraft(source());

    expect(draft.input.context).toEqual({ hasCT: true, isSus: true, hasLab: true, hasICU: false });
    expect(draft.input.redFlags).toEqual({ elderly65: true });
  });

  it('omite contexto e bandeiras que não reconhece ou que estão todas desmarcadas', () => {
    const draft = buildEvalCaseDraft({
      ...source({ params: { redFlags: { anticoagulant: false } } }),
      encounterContext: { hasCT: 'sim' },
    });

    expect(draft.input).not.toHaveProperty('context');
    expect(draft.input).not.toHaveProperty('redFlags');
    expectValidCase(draft);
  });

  it('resume na proveniência o reporte e o que o Copiloto respondeu', () => {
    const draft = buildEvalCaseDraft(source());

    expect(draft.provenance.notes).toBe(
      'Reporte "cenário errado" de 2026-10-01 sobre a rodada 1 (modelo claude-sonnet, cobertura da base partial). ' +
        'Comentário do médico (mascarado): "Era dengue, foi para sepse.". ' +
        'Hipótese principal do Copiloto: Sepse de foco indeterminado.',
    );
  });

  it('diz na proveniência quando não há comentário nem hipótese', () => {
    const draft = buildEvalCaseDraft({
      ...source({ params: null, rawOutput: {} }),
      feedback: { ...source().feedback, kind: 'helpful', comment: '  ' },
    });

    expect(draft.tags).toContain('foi-util');
    expect(draft.provenance.notes).toContain('Sem comentário do médico.');
    expect(draft.provenance.notes).toContain('O Copiloto não registrou hipótese principal.');
    expectValidCase(draft);
  });

  it('tem o tipo de um caso do gabarito (contrato que o web consome)', () => {
    expectTypeOf<EvalCaseDraft>().toMatchTypeOf<z.input<typeof ClinicalCaseSchema>>();
  });
});

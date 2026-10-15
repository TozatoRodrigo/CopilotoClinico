import { describe, expect, it } from 'vitest';
import { validateOutputV2 } from './output-validator-v2';
import { validateOutputV3 } from './output-validator-v3';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

/**
 * Validador da decisão v3 (emenda de 11/10/2026 ao ADR-013): uma linha da
 * tabela de regras por bloco. Só JSON/schema, beco sem saída e tipo de
 * resposta bloqueiam; o resto é retry com feedback, correção determinística
 * ou aviso.
 */

const EVIDENCE_IDS = ['chunk-avc', 'web:1'];

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    action: 'TC de crânio sem contraste imediata',
    rationale: 'Separa AVC isquêmico de hemorrágico',
    category: 'diagnostic',
    layer: 'now',
    dependsOn: null,
    basis: 'model_knowledge',
    citationChunkId: null,
    confidence: 0.9,
    ...overrides,
  };
}

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-ultimo-visto-bem',
    question: 'Qual o horário do último momento em que foi visto sem déficit?',
    why: 'Define a janela de reperfusão',
    separates: ['AVC na janela de trombólise', 'AVC fora da janela'],
    criticality: 'blocker',
    expectedAnswerType: 'text',
    choices: null,
    purpose: 'Janela de reperfusão',
    ...overrides,
  };
}

// O fixture traz idade, PA e início: perguntar qualquer um deles é dado já informado.
const askAge = question({ id: 'q-idade', question: 'Qual a idade do paciente?' });

function output(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    reasoning:
      'Déficit focal súbito na janela. Hipoglicemia e hemorragia intracerebral precisam ser afastadas; oclusão de grande vaso define trombectomia.',
    redFlags: [],
    recommendations: [recommendation()],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
    ...overrides,
  });
}

function validate(raw: string, understanding = understandingFixture()) {
  return validateOutputV3(raw, EVIDENCE_IDS, { understanding });
}

describe('validateOutputV3', () => {
  it('accepts a complete output with no findings', () => {
    const result = validate(output({ clarifyingQuestions: [question()] }));

    expect(result).toMatchObject({ valid: true, errors: [], correctable: [], warnings: [] });
    expect(result.output?.clarifyingQuestions).toHaveLength(1);
  });

  describe('JSON/schema, beco sem saída e tipo de resposta: bloqueiam, como hoje', () => {
    it('rejects invalid JSON', () => {
      expect(validate('não é JSON').errors).toEqual(['Output is not valid JSON']);
    });

    it('rejects a recommendation without layer or basis', () => {
      const result = validate(
        output({ recommendations: [{ ...recommendation(), layer: undefined, basis: undefined }] }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Schema validation failed');
    });

    it('keeps the hard cap of 3 questions in the schema', () => {
      const result = validate(
        output({
          clarifyingQuestions: [
            question({ id: 'q1' }),
            question({ id: 'q2' }),
            question({ id: 'q3' }),
            question({ id: 'q4' }),
          ],
        }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('at most 3 items');
    });

    it('rejects a dead end', () => {
      const result = validate(output({ recommendations: [] }));

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('DEAD END');
    });

    it('rejects a yes/no question that asks for a value', () => {
      const result = validate(
        output({
          clarifyingQuestions: [
            question({ question: 'Qual o horário da última dose?', expectedAnswerType: 'boolean' }),
          ],
        }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('ANSWER TYPE MISMATCH');
    });
  });

  describe('linguagem de probabilidade: corrigível, nunca bloqueia', () => {
    const differential = {
      hypothesis: 'Hemorragia intracerebral',
      whyConsider: 'Responde por 15% dos AVC',
      whatDistinguishes: 'TC de crânio sem contraste',
      cannotMiss: true,
      timeToHarm: 'minutos',
    };

    it('asks for one retry instead of blocking the answer', () => {
      const result = validate(output({ differentials: [differential] }));

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.correctable).toEqual([
        expect.stringContaining('PROBABILITY LANGUAGE NOT ALLOWED'),
      ]);
    });

    it('still blocks in v2, which stays as it is', () => {
      const result = validateOutputV2(output({ differentials: [differential] }), EVIDENCE_IDS, {
        understanding: understandingFixture(),
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('regras corrigíveis, como na v2', () => {
    it.each([
      [
        'depends without data',
        { recommendations: [recommendation({ layer: 'depends', dependsOn: null })] },
        'DEPENDS WITHOUT DATA',
      ],
      [
        'source without a valid citation',
        { recommendations: [recommendation({ basis: 'source', citationChunkId: 'inventado' })] },
        'SOURCE WITHOUT VALID CITATION',
      ],
      [
        'model knowledge with a citation',
        { recommendations: [recommendation({ citationChunkId: 'chunk-avc' })] },
        'MODEL KNOWLEDGE WITH CITATION',
      ],
      [
        'model knowledge with a dose',
        { recommendations: [recommendation({ action: 'Adrenalina 0,5 mg IM' })] },
        'DOSE WITHOUT SOURCE',
      ],
      [
        'a question without separates',
        { clarifyingQuestions: [question({ separates: [] })] },
        'QUESTION WITHOUT SEPARATES',
      ],
    ])('flags %s as correctable', (_label, overrides, finding) => {
      const result = validate(output(overrides));

      expect(result.valid).toBe(true);
      expect(result.correctable).toEqual([expect.stringContaining(finding)]);
    });

    it('marks a sourced recommendation without a citable id as unfounded', () => {
      const result = validate(
        output({ recommendations: [recommendation({ basis: 'source', citationChunkId: null })] }),
      );

      expect(result.unfoundedRecommendations).toEqual([0]);
    });
  });

  describe('pergunta sobre dado já informado: correção determinística, sem retry', () => {
    it('removes the question from the output and warns, without asking for a retry', () => {
      const result = validate(output({ clarifyingQuestions: [askAge, question()] }));

      expect(result.valid).toBe(true);
      expect(result.correctable).toEqual([]);
      expect(result.output?.clarifyingQuestions.map((q) => q.id)).toEqual(['q-ultimo-visto-bem']);
      expect(result.warnings).toEqual([
        expect.stringContaining(
          'QUESTION FOR KNOWN DATA REMOVED: clarifyingQuestions index 0 asks for idade',
        ),
      ]);
    });

    it('keeps the recommendations untouched', () => {
      const result = validate(output({ clarifyingQuestions: [askAge] }));

      expect(result.output?.clarifyingQuestions).toEqual([]);
      expect(result.output?.recommendations).toHaveLength(1);
    });

    it('keeps the question, and only warns, when removing it would leave no next step', () => {
      const result = validate(output({ recommendations: [], clarifyingQuestions: [askAge] }));

      expect(result.valid).toBe(true);
      expect(result.output?.clarifyingQuestions.map((q) => q.id)).toEqual(['q-idade']);
      expect(result.warnings).toEqual([
        expect.stringContaining('QUESTION FOR KNOWN DATA KEPT: clarifyingQuestions index 0'),
      ]);
    });

    it('does not ask to fix a question it already removed', () => {
      const removedAndBroken = question({
        id: 'q-pa',
        question: 'Qual a PA na chegada?',
        expectedAnswerType: 'boolean',
        separates: [],
      });

      const result = validate(output({ clarifyingQuestions: [removedAndBroken, question()] }));

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.correctable).toEqual([]);
    });

    it('points the other findings at the questions as the model wrote them', () => {
      const result = validate(
        output({ clarifyingQuestions: [askAge, question({ id: 'q2', separates: [] })] }),
      );

      expect(result.correctable).toEqual([
        expect.stringContaining('QUESTION WITHOUT SEPARATES: clarifyingQuestions at index 1'),
      ]);
    });
  });

  describe('hipótese grave não citada: só aviso', () => {
    it('warns, without a retry', () => {
      const result = validate(output({ reasoning: 'Provável AVC isquêmico.' }));

      expect(result.valid).toBe(true);
      expect(result.correctable).toEqual([]);
      expect(result.warnings).toEqual([expect.stringContaining('CANNOT-MISS NOT ADDRESSED')]);
    });

    it('skips the understanding rules when Stage 1 failed', () => {
      const result = validateOutputV3(
        output({ reasoning: 'Provável AVC isquêmico.', clarifyingQuestions: [askAge] }),
        EVIDENCE_IDS,
        { understanding: null },
      );

      expect(result.warnings).toEqual([]);
      expect(result.output?.clarifyingQuestions).toHaveLength(1);
    });
  });

  describe('tetos da v3: só aviso', () => {
    const now = (count: number) =>
      Array.from({ length: count }, (_, index) => recommendation({ action: `Conduta ${index}` }));
    const depends = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        recommendation({ action: `Depende ${index}`, layer: 'depends', dependsOn: 'TC' }),
      );

    it('accepts 2 questions, 6 "now" and 5 "depends" without a warning', () => {
      const result = validate(
        output({
          recommendations: [...now(6), ...depends(5)],
          clarifyingQuestions: [question({ id: 'q1' }), question({ id: 'q2' })],
        }),
      );

      expect(result.warnings).toEqual([]);
    });

    it('warns on a third question, keeping it', () => {
      const result = validate(
        output({
          clarifyingQuestions: [
            question({ id: 'q1' }),
            question({ id: 'q2' }),
            question({ id: 'q3' }),
          ],
        }),
      );

      expect(result.valid).toBe(true);
      expect(result.correctable).toEqual([]);
      expect(result.output?.clarifyingQuestions).toHaveLength(3);
      expect(result.warnings).toEqual([expect.stringContaining('OVER THE QUESTION LIMIT: 3')]);
    });

    it('warns on a 7th "now" and a 6th "depends", keeping them', () => {
      const result = validate(output({ recommendations: [...now(7), ...depends(6)] }));

      expect(result.valid).toBe(true);
      expect(result.correctable).toEqual([]);
      expect(result.output?.recommendations).toHaveLength(13);
      expect(result.warnings).toEqual([
        expect.stringContaining('OVER THE "NOW" LIMIT: 7'),
        expect.stringContaining('OVER THE "DEPENDS" LIMIT: 6'),
      ]);
    });

    it('counts the questions the physician will see, after the removal', () => {
      const result = validate(
        output({
          clarifyingQuestions: [askAge, question({ id: 'q1' }), question({ id: 'q2' })],
        }),
      );

      expect(result.warnings).toEqual([expect.stringContaining('QUESTION FOR KNOWN DATA REMOVED')]);
    });
  });
});

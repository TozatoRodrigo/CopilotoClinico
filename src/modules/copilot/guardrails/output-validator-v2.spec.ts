import { describe, expect, it } from 'vitest';
import { validateOutputV2 } from './output-validator-v2';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

/**
 * F1 — validador da decisão v2 (ADR-013). As regras novas são corrigíveis:
 * entram em `correctable` (um retry com feedback, depois aviso) e nunca
 * invalidam a resposta.
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
  return validateOutputV2(raw, EVIDENCE_IDS, { understanding });
}

describe('validateOutputV2', () => {
  it('accepts a complete v2 output with no correctable findings', () => {
    const result = validate(
      output({
        recommendations: [
          recommendation(),
          recommendation({
            action: 'Trombólise com alteplase 0,9 mg/kg',
            category: 'therapeutic',
            layer: 'depends',
            dependsOn: 'TC de crânio sem contraste sem sangramento',
            basis: 'source',
            citationChunkId: 'web:1',
          }),
        ],
        clarifyingQuestions: [question()],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.correctable).toEqual([]);
  });

  it('derives the provisional preliminary flag from the layer', () => {
    const result = validate(
      output({
        recommendations: [
          recommendation(),
          recommendation({ layer: 'depends', dependsOn: 'Resultado da TC' }),
        ],
      }),
    );

    expect(result.output?.recommendations.map((rec) => rec.preliminary)).toEqual([false, true]);
  });

  describe('erros que bloqueiam, como na v1', () => {
    it('rejects invalid JSON', () => {
      expect(validate('não é JSON').errors).toEqual(['Output is not valid JSON']);
    });

    it('rejects a recommendation without layer or basis', () => {
      const result = validate(
        output({
          recommendations: [{ ...recommendation(), layer: undefined, basis: undefined }],
        }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Schema validation failed');
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
            question({ question: 'Qual o horário do início?', expectedAnswerType: 'boolean' }),
          ],
        }),
      );

      expect(result.errors.join(' ')).toContain('ANSWER TYPE MISMATCH');
    });
  });

  describe('regras corrigíveis da v2', () => {
    it('asks for dependsOn on a depends recommendation', () => {
      const result = validate(
        output({ recommendations: [recommendation({ layer: 'depends', dependsOn: '  ' })] }),
      );

      expect(result.valid).toBe(true);
      expect(result.correctable).toEqual([
        expect.stringContaining('DEPENDS WITHOUT DATA: recommendations at index 0'),
      ]);
    });

    it.each([
      ['an unknown id', 'chunk-inventado'],
      ['no id', null],
    ])('flags a sourced recommendation with %s', (_label, citationChunkId) => {
      const result = validate(
        output({ recommendations: [recommendation({ basis: 'source', citationChunkId })] }),
      );

      expect(result.valid).toBe(true);
      expect(result.correctable).toEqual([
        expect.stringContaining('SOURCE WITHOUT VALID CITATION'),
      ]);
      expect(result.correctable?.[0]).toContain('chunk-avc, web:1');
      expect(result.unfoundedRecommendations).toEqual([0]);
    });

    it('flags model knowledge that carries a citation id', () => {
      const result = validate(
        output({ recommendations: [recommendation({ citationChunkId: 'chunk-avc' })] }),
      );

      expect(result.correctable).toEqual([
        expect.stringContaining('MODEL KNOWLEDGE WITH CITATION'),
      ]);
    });

    it.each([
      ['Adrenalina 0,5 mg IM', 'Anafilaxia com hipotensão'],
      ['Glicose 50% 40 mL IV', 'Hipoglicemia confirmada'],
      ['Cristaloide 30 mL/kg', 'Hipoperfusão'],
    ])('flags a dose without source: "%s"', (action, rationale) => {
      const result = validate(output({ recommendations: [recommendation({ action, rationale })] }));

      expect(result.correctable).toEqual([expect.stringContaining('DOSE WITHOUT SOURCE')]);
    });

    it.each([
      ['Avaliar NIHSS', 'NIHSS 14 indica déficit grave'],
      ['Controle pressórico', 'Manter PA < 185/110 antes da trombólise'],
      ['Glicemia capilar', 'Corrigir se glicemia < 70'],
      ['Oxigênio suplementar', 'Manter SpO2 ≥ 94%'],
      ['Corrigir hipoglicemia com glicose', 'Dose conforme protocolo institucional'],
    ])('does not mistake criteria or targets for a dose: "%s"', (action, rationale) => {
      const result = validate(output({ recommendations: [recommendation({ action, rationale })] }));

      expect(result.correctable).toEqual([]);
    });

    it('accepts a dose backed by a cited source', () => {
      const result = validate(
        output({
          recommendations: [
            recommendation({
              action: 'Adrenalina 0,5 mg IM',
              basis: 'source',
              citationChunkId: 'chunk-avc',
            }),
          ],
        }),
      );

      expect(result.correctable).toEqual([]);
    });

    it('asks every question to say which hypotheses it separates', () => {
      const result = validate(output({ clarifyingQuestions: [question({ separates: [] })] }));

      expect(result.correctable).toEqual([
        expect.stringContaining('QUESTION WITHOUT SEPARATES: clarifyingQuestions at index 0'),
      ]);
    });

    describe('perguntas sobre dado que o caso já informa', () => {
      it.each([
        ['Qual a pressão arterial atual?', 'pressão arterial'],
        ['Qual a PA na chegada?', 'pressão arterial'],
        ['Qual a idade do paciente?', 'idade'],
        ['Há quanto tempo começaram os sintomas?', 'início dos sintomas'],
      ])('flags "%s"', (text, field) => {
        const result = validate(output({ clarifyingQuestions: [question({ question: text })] }));

        expect(result.correctable).toEqual([
          expect.stringContaining(
            `QUESTION FOR KNOWN DATA: clarifyingQuestions index 0 asks for ${field}`,
          ),
        ]);
      });

      it('accepts a question about data the case does not give', () => {
        // O fixture não traz glicemia nem frequência respiratória.
        const result = validate(
          output({
            clarifyingQuestions: [
              question({ question: 'Qual a glicemia capilar?' }),
              question({ id: 'q-fr', question: 'Qual a frequência respiratória?' }),
            ],
          }),
        );

        expect(result.correctable).toEqual([]);
      });
    });

    describe('cobertura das hipóteses que não podem passar', () => {
      it('accepts a hypothesis named with other words, accents and case', () => {
        const result = validate(
          output({
            reasoning: 'Déficit focal súbito. Afastar HIPOGLICEMIA e AVC hemorragico.',
            differentials: [
              {
                hypothesis: 'Oclusão de grande vaso',
                whyConsider: 'Déficit cortical',
                whatDistinguishes: 'Angio-TC',
                cannotMiss: true,
                timeToHarm: 'minutos',
              },
            ],
          }),
        );

        expect(result.correctable).toEqual([]);
      });

      it('accepts a hypothesis addressed only in a red flag', () => {
        const result = validate(
          output({
            reasoning: 'Déficit focal súbito com hemorragia intracerebral a afastar.',
            redFlags: [
              {
                finding: 'Déficit focal agudo',
                severity: 'high',
                action:
                  'Glicemia capilar para afastar hipoglicemia; angio-TC para oclusão de grande vaso',
              },
            ],
          }),
        );

        expect(result.correctable).toEqual([]);
      });

      it('names the cannot-miss hypotheses the output never addressed', () => {
        // "AVC isquêmico" sozinho não cobre a oclusão de grande vaso: é a
        // omissão (angio-TC, trombectomia) que motivou a ADR-013.
        const result = validate(output({ reasoning: 'Provável AVC isquêmico.' }));

        expect(result.correctable).toEqual([
          expect.stringContaining(
            'lists "AVC isquêmico por oclusão de grande vaso", "Hemorragia intracerebral", "Hipoglicemia" as cannot-miss',
          ),
        ]);
      });

      it('skips the understanding rules when Stage 1 failed', () => {
        const result = validateOutputV2(
          output({
            reasoning: 'Provável AVC isquêmico.',
            clarifyingQuestions: [question({ question: 'Qual a PA na chegada?' })],
          }),
          EVIDENCE_IDS,
          { understanding: null },
        );

        expect(result.correctable).toEqual([]);
      });
    });
  });
});

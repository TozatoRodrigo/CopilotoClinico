import { describe, expect, it } from 'vitest';
import {
  collectObjects,
  jsonShape,
  UNSUPPORTED_KEYWORDS,
  zodShape,
} from '../../../tests/helpers/json-schema-parity';
import {
  analysisRow,
  PATIENT_CPF,
  PATIENT_REF,
  reviewQuestionsWire,
  sepsisAnalysis,
} from '../../../tests/fixtures/shift-review';
import { validateStructured } from '../copilot/understanding/case-understanding.schema';
import { buildReviewMaterial } from './review-material';
import {
  checkReviewQuestions,
  REVIEW_QUESTIONS_JSON_SCHEMA,
  ReviewQuestionsOutputSchema,
  type ReviewQuestionsOutput,
} from './review-questions.schema';

const material = buildReviewMaterial([
  analysisRow(),
  analysisRow({ rawOutput: sepsisAnalysis(), createdAt: new Date('2026-10-13T12:00:00Z') }),
]);

function parse(wire: Record<string, unknown>): ReviewQuestionsOutput {
  const validation = validateStructured(ReviewQuestionsOutputSchema, JSON.stringify(wire));
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return validation.value;
}

describe('REVIEW_QUESTIONS_JSON_SCHEMA', () => {
  it('mirrors the zod schema field names, types and enums', () => {
    expect(jsonShape(REVIEW_QUESTIONS_JSON_SCHEMA.schema)).toEqual(
      zodShape(ReviewQuestionsOutputSchema),
    );
  });

  it('closes every object and lists every property as required (OpenAI strict mode)', () => {
    for (const object of collectObjects(REVIEW_QUESTIONS_JSON_SCHEMA.schema)) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties));
    }
  });

  it('uses only keywords supported by both providers', () => {
    const serialized = JSON.stringify(REVIEW_QUESTIONS_JSON_SCHEMA.schema);
    for (const keyword of UNSUPPORTED_KEYWORDS) {
      expect(serialized).not.toContain(`"${keyword}"`);
    }
  });
});

describe('ReviewQuestionsOutputSchema', () => {
  it('accepts a valid output', () => {
    expect(
      validateStructured(ReviewQuestionsOutputSchema, JSON.stringify(reviewQuestionsWire())).valid,
    ).toBe(true);
  });

  it('rejects more than 3 questions', () => {
    const wire = reviewQuestionsWire();
    const questions = wire.questions as unknown[];
    const result = validateStructured(
      ReviewQuestionsOutputSchema,
      JSON.stringify({ questions: [...questions, questions[0]] }),
    );

    expect(result).toEqual({
      valid: false,
      errors: ['questions: questions must contain at most 3 questions'],
    });
  });
});

describe('checkReviewQuestions', () => {
  it('accepts questions grounded in the listed sources and binds each to its analysis', () => {
    const { accepted, errors } = checkReviewQuestions(parse(reviewQuestionsWire()), material);

    expect(errors).toEqual([]);
    expect(accepted.map(({ source }) => [source.key, source.syndrome])).toEqual([
      ['F1', 'cefaleia'],
      ['F1', 'cefaleia'],
      ['F2', 'febre-hipotensao'],
    ]);
  });

  it('refuses a source that the analyses did not cite', () => {
    const { accepted, errors } = checkReviewQuestions(
      parse(reviewQuestionsWire([{ sourceKey: 'F9' }])),
      material,
    );

    expect(accepted).toHaveLength(2);
    expect(errors).toEqual([
      'questions.0.sourceKey: not one of the listed sources; cite only a key from <sources>',
    ]);
  });

  it.each([
    ['a CPF', { stem: `Paciente CPF ${PATIENT_CPF} com cefaleia: qual exame?` }],
    ['the patientRef', { explanation: `No caso ${PATIENT_REF}, a TC veio normal.` }],
    ['a redaction marker copied from the material', { topic: 'Caso [PATIENT_REF_REDACTED]' }],
    ['a phone number in an option', { options: ['Ligar (11) 91234-5678', 'B', 'C', 'D'] }],
  ])('refuses a question carrying %s', (_label, override) => {
    const { accepted, errors } = checkReviewQuestions(
      parse(reviewQuestionsWire([override])),
      material,
    );

    expect(accepted).toHaveLength(2);
    expect(errors).toContain(
      'questions.0: contains patient data; write about the clinical topic, never about the patient',
    );
  });

  it('requires exactly "Verdadeiro" and "Falso" in a true/false question', () => {
    const { errors } = checkReviewQuestions(
      parse(reviewQuestionsWire([{}, { options: ['Sim', 'Não'] }])),
      material,
    );

    expect(errors).toEqual([
      'questions.1.options: true_false options must be exactly ["Verdadeiro", "Falso"]',
    ]);
  });

  it('requires distinct options and a correct option inside the list', () => {
    const { errors } = checkReviewQuestions(
      parse(reviewQuestionsWire([{ options: ['A', 'A', 'B', 'C'], correctOption: 4 }])),
      material,
    );

    expect(errors).toEqual([
      'questions.0.options: options must be different from each other',
      'questions.0.correctOption: must be the zero-based index of one of the options',
    ]);
  });

  it('refuses a repeated question', () => {
    const wire = reviewQuestionsWire();
    const [first] = wire.questions as Array<Record<string, unknown>>;
    const { accepted, errors } = checkReviewQuestions(
      parse(reviewQuestionsWire([{}, { ...first }])),
      material,
    );

    expect(accepted).toHaveLength(2);
    expect(errors).toEqual(['questions.1.stem: repeats another question']);
  });
});

import { describe, expect, it } from 'vitest';
import type { IntakeExpected } from './case.schema';
import { gradeFields, type ExtractedFields } from './grading';

const NO_VITALS = {
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
};

function fields(overrides: Partial<ExtractedFields> = {}): ExtractedFields {
  return {
    sex: 'M',
    age: 22,
    vitals: { ...NO_VITALS, systolicBp: 92, temperature: 39.4 },
    syndrome: 'febre-hipotensao',
    instability: true,
    timeCritical: true,
    ...overrides,
  };
}

function expected(overrides: Partial<IntakeExpected> = {}): IntakeExpected {
  return {
    sex: 'M',
    age: 22,
    vitals: { ...NO_VITALS, systolicBp: [92, 90], temperature: 39.4 },
    ...overrides,
  };
}

function kinds(checks: ReturnType<typeof gradeFields>) {
  return Object.fromEntries(checks.map((check) => [check.field, check.kind]));
}

describe('gradeFields', () => {
  it('accepts any of the listed values and a decimal written by the model', () => {
    const result = kinds(
      gradeFields(
        fields({ vitals: { ...NO_VITALS, systolicBp: 90, temperature: 39.4 } }),
        expected(),
      ),
    );
    expect(result).toMatchObject({
      sex: 'ok',
      age: 'ok',
      systolicBp: 'ok',
      temperature: 'ok',
      glucose: 'ok',
    });
  });

  it('tells wrong, missing and invented apart', () => {
    const result = kinds(
      gradeFields(
        fields({
          sex: 'F',
          age: null,
          vitals: { ...NO_VITALS, systolicBp: 92, temperature: 39.4, glucose: 110 },
        }),
        expected(),
      ),
    );
    expect(result).toMatchObject({ sex: 'wrong', age: 'missing', glucose: 'invented' });
  });

  it('counts a sex the text does not give as invented', () => {
    const [sex] = gradeFields(fields({ sex: 'M' }), expected({ sex: null }));
    expect(sex).toEqual({ field: 'sex', kind: 'invented', expected: '—', got: 'M' });
  });

  it('grades judgment only where the gold has it', () => {
    const withoutJudgment = gradeFields(fields(), expected()).map((check) => check.field);
    expect(withoutJudgment).not.toContain('syndrome');
    expect(withoutJudgment).not.toContain('instability');

    const result = kinds(
      gradeFields(
        fields({ syndrome: 'febre', instability: false }),
        expected({ syndrome: ['febre-hipotensao'], instability: true, timeCritical: true }),
      ),
    );
    expect(result).toMatchObject({
      syndrome: 'disagree',
      instability: 'disagree',
      timeCritical: 'ok',
    });
  });
});

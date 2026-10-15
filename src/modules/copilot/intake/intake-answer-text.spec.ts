import { describe, expect, it } from 'vitest';
import type { VitalsAnswer } from '../../../shared/contracts/clinical';
import { intakeAnswerText, vitalsText } from './intake-answer-text';
import type { IntakeQuestionRecord } from './intake-gate';

const NO_VITALS: VitalsAnswer = {
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
};

const glucoseQuestion: IntakeQuestionRecord = {
  id: 'intake-1',
  question: 'Qual a glicemia capilar?',
  answerType: 'number',
  choices: [],
  unit: 'mg/dL',
  vitalSigns: [],
  separates: ['Hipoglicemia', 'AVC'],
  why: 'Hipoglicemia mimetiza AVC.',
  urgentAnswers: [],
};

describe('vitalsText', () => {
  it('writes the vital signs the way they are said at the bedside', () => {
    expect(
      vitalsText({ ...NO_VITALS, systolicBp: 150, diastolicBp: 90, heartRate: 96, temperature: 37.2 }),
    ).toBe('PA 150×90 mmHg · FC 96 bpm · Tax 37,2 °C');
  });

  it('writes saturation without a space before the percent sign', () => {
    expect(vitalsText({ ...NO_VITALS, spo2: 92 })).toBe('SpO₂ 92%');
  });

  it('names a lone systolic pressure', () => {
    expect(vitalsText({ ...NO_VITALS, systolicBp: 80 })).toBe('PAS 80 mmHg');
  });
});

describe('intakeAnswerText', () => {
  it('adds the unit of the question to a number', () => {
    expect(intakeAnswerText(glucoseQuestion, 54)).toBe('54 mg/dL');
  });

  it('keeps a text answer as written', () => {
    expect(intakeAnswerText(glucoseQuestion, '  não medi  ')).toBe('não medi');
  });

  it('formats a vital signs answer', () => {
    expect(intakeAnswerText(undefined, { ...NO_VITALS, glucose: 110 })).toBe(
      'Glicemia capilar 110 mg/dL',
    );
  });
});

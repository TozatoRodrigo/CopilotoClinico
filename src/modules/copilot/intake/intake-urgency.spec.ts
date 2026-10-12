import { describe, expect, it } from 'vitest';
import type { VitalsAnswer } from '../../../shared/contracts/clinical';
import type { IntakeQuestionRecord } from './intake-gate';
import { isUrgentAnswer, matchOption, vitalsShowInstability } from './intake-urgency';

const NO_VITALS: VitalsAnswer = {
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
};

const suddenOnset: IntakeQuestionRecord = {
  id: 'intake-1',
  question: 'A dor chegou ao máximo em menos de 1 minuto?',
  answerType: 'boolean',
  choices: ['Sim', 'Não', 'Não sei'],
  unit: null,
  vitalSigns: [],
  separates: ['Hemorragia subaracnóidea', 'Enxaqueca'],
  why: 'Início súbito pede TC já.',
  urgentAnswers: ['Sim'],
};

describe('vitalsShowInstability', () => {
  it.each([
    ['hypotension', { systolicBp: 70, diastolicBp: 40 }],
    ['hypoxemia', { spo2: 84 }],
    ['extreme tachycardia', { heartRate: 145 }],
    ['extreme bradycardia', { heartRate: 35 }],
    ['tachypnea', { respiratoryRate: 34 }],
    ['hypoglycemia', { glucose: 48 }],
  ])('flags %s', (_label, vitals) => {
    expect(vitalsShowInstability({ ...NO_VITALS, ...vitals })).toBe(true);
  });

  it('leaves stable vital signs alone', () => {
    expect(
      vitalsShowInstability({
        ...NO_VITALS,
        systolicBp: 150,
        diastolicBp: 90,
        heartRate: 96,
        spo2: 97,
        temperature: 38.4,
      }),
    ).toBe(false);
  });
});

describe('matchOption', () => {
  it('reads dictated punctuation and casing', () => {
    expect(matchOption('Sim.', suddenOnset.choices)).toBe('Sim');
  });

  it('reads an option followed by detail', () => {
    expect(matchOption('sim, há umas 2 horas', suddenOnset.choices)).toBe('Sim');
  });

  it('prefers the longest option, so "não sei" is not "não"', () => {
    expect(matchOption('Não sei.', suddenOnset.choices)).toBe('Não sei');
  });

  it('finds nothing in an answer that is not an option', () => {
    expect(matchOption('simultâneo com a tosse', suddenOnset.choices)).toBeNull();
  });
});

describe('isUrgentAnswer', () => {
  it('stops on a dictated urgent option', () => {
    expect(isUrgentAnswer(suddenOnset, 'Sim.', 'Sim.')).toBe(true);
  });

  it('does not stop on a non-urgent option', () => {
    expect(isUrgentAnswer(suddenOnset, 'Não sei', 'Não sei')).toBe(false);
  });

  it('stops on unstable vital signs, whatever the question says', () => {
    expect(
      isUrgentAnswer(undefined, { ...NO_VITALS, systolicBp: 70, diastolicBp: 40 }, 'PA 70×40 mmHg'),
    ).toBe(true);
  });
});

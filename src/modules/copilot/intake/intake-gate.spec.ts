import { describe, expect, it } from 'vitest';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import {
  intakeCandidateFixture,
  intakeReadingFixture,
} from '../../../../tests/fixtures/intake-reading';
import { decideIntake, toIntakeQuestion } from './intake-gate';

const structuredData = understandingFixture().structuredData;

describe('decideIntake', () => {
  describe('when the patient is unstable', () => {
    it('goes straight to the plan without questions', () => {
      const decision = decideIntake(
        intakeReadingFixture({ instability: { present: true, findings: ['PA 70x40'] } }),
      );

      expect(decision).toEqual({ path: 'unstable', questions: [] });
    });
  });

  describe('when nothing missing changes the conduct', () => {
    it('goes straight to the plan', () => {
      expect(decideIntake(intakeReadingFixture({ intakeQuestions: [] }))).toEqual({
        path: 'complete',
        questions: [],
      });
    });

    it('treats a reading whose questions were all dropped as complete', () => {
      const decision = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [intakeCandidateFixture({ question: 'Qual a idade do paciente?' })],
        }),
      );

      expect(decision.path).toBe('complete');
    });
  });

  describe('when data that changes the conduct is missing', () => {
    it('asks at most 3 questions, most decisive first, with stable ids', () => {
      const decision = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [
            intakeCandidateFixture({ question: 'Primeira?' }),
            intakeCandidateFixture({ question: 'Segunda?' }),
            intakeCandidateFixture({ question: 'Terceira?' }),
            intakeCandidateFixture({ question: 'Quarta?' }),
          ],
        }),
      );

      expect(decision.path).toBe('ask');
      expect(decision.questions.map((question) => [question.id, question.question])).toEqual([
        ['intake-1', 'Primeira?'],
        ['intake-2', 'Segunda?'],
        ['intake-3', 'Terceira?'],
      ]);
    });

    it('asks a single question in a time-critical case', () => {
      const decision = decideIntake(
        intakeReadingFixture({
          timeCritical: true,
          intakeQuestions: [
            intakeCandidateFixture({ question: 'Primeira?' }),
            intakeCandidateFixture({ question: 'Segunda?' }),
          ],
        }),
      );

      expect(decision.questions).toHaveLength(1);
    });

    it('drops a question about data the case already gives', () => {
      const decision = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [
            intakeCandidateFixture({ question: 'Qual a pressão arterial agora?' }),
            intakeCandidateFixture({ question: 'Há rigidez de nuca?' }),
          ],
        }),
      );

      expect(decision.questions.map((question) => question.question)).toEqual([
        'Há rigidez de nuca?',
      ]);
    });
  });

  describe('answer options', () => {
    it('always offers Sim, Não and Não sei on a yes/no question', () => {
      const [question] = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [intakeCandidateFixture({ choices: ['Talvez'], urgentAnswers: ['sim'] })],
        }),
      ).questions;

      expect(question?.choices).toEqual(['Sim', 'Não', 'Não sei']);
      expect(question?.urgentAnswers).toEqual(['Sim']);
    });

    it('keeps only urgent answers that are one of the options', () => {
      const [question] = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [
            intakeCandidateFixture({
              answerType: 'choice',
              choices: ['Rigidez de nuca', 'Déficit focal', 'Nenhum', 'Não examinei'],
              urgentAnswers: ['rigidez de nuca', 'Convulsão'],
            }),
          ],
        }),
      ).questions;

      expect(question?.urgentAnswers).toEqual(['Rigidez de nuca']);
    });

    it('drops a choice question with fewer than 2 options', () => {
      const decision = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [intakeCandidateFixture({ answerType: 'choice', choices: ['Única'] })],
        }),
      );

      expect(decision.path).toBe('complete');
    });

    it('keeps the unit only on number questions', () => {
      const [number, text] = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [
            intakeCandidateFixture({ question: 'Glicemia?', answerType: 'number', unit: 'mg/dL' }),
            intakeCandidateFixture({ question: 'O que viu?', answerType: 'text', unit: 'mg/dL' }),
          ],
        }),
      ).questions;

      expect(number?.unit).toBe('mg/dL');
      expect(text?.unit).toBeNull();
    });
  });

  describe('vital signs', () => {
    it('asks only the vital signs the case did not give', () => {
      const [question] = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [
            intakeCandidateFixture({
              question: 'Quais sinais vitais você já tem?',
              answerType: 'vitals',
              vitalSigns: ['bloodPressure', 'heartRate', 'temperature', 'glucose'],
            }),
          ],
        }),
      ).questions;

      // O caso já informou PA e FC (ver understandingFixture).
      expect(structuredData.vitals.systolicBp).not.toBeNull();
      expect(question?.vitalSigns).toEqual(['temperature', 'glucose']);
    });

    it('drops a vital signs question when the case gave all of them', () => {
      const decision = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [
            intakeCandidateFixture({
              answerType: 'vitals',
              vitalSigns: ['bloodPressure', 'heartRate'],
            }),
          ],
        }),
      );

      expect(decision.path).toBe('complete');
    });

    it('keeps one vital signs question', () => {
      const decision = decideIntake(
        intakeReadingFixture({
          intakeQuestions: [
            intakeCandidateFixture({ answerType: 'vitals', vitalSigns: ['temperature'] }),
            intakeCandidateFixture({ answerType: 'vitals', vitalSigns: ['glucose'] }),
          ],
        }),
      );

      expect(decision.questions).toHaveLength(1);
    });
  });
});

describe('toIntakeQuestion', () => {
  it('leaves the urgent answers on the server', () => {
    const [record] = decideIntake(intakeReadingFixture()).questions;
    if (!record) throw new Error('a leitura de exemplo tem uma pergunta');

    expect(toIntakeQuestion(record)).not.toHaveProperty('urgentAnswers');
  });
});

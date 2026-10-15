import {
  READING_VITAL_SIGNS,
  type IntakeQuestionCandidate,
  type IntakeReading,
  type IntakeReadingWire,
} from '../../src/modules/copilot/intake/intake-reading.schema';
import { understandingFixture } from './case-understanding';

/** ADR-014 — pergunta candidata válida da leitura do caso. */
export function intakeCandidateFixture(
  overrides: Partial<IntakeQuestionCandidate> = {},
): IntakeQuestionCandidate {
  return {
    question: 'O déficit começou de forma súbita, em segundos?',
    answerType: 'boolean',
    choices: [],
    unit: null,
    vitalSigns: [],
    separates: ['AVC', 'Lesão expansiva'],
    why: 'Início súbito mantém a janela de reperfusão aberta.',
    urgentAnswers: ['Sim'],
    ...overrides,
  };
}

/** ADR-014 — leitura do caso de AVC sem TC (o mesmo entendimento da Etapa 1) com uma pergunta. */
export function intakeReadingFixture(overrides: Partial<IntakeReading> = {}): IntakeReading {
  return {
    ...understandingFixture(),
    timeCritical: false,
    intakeQuestions: [intakeCandidateFixture()],
    ...overrides,
  };
}

/** A leitura como o modelo a escreve: os sinais vitais informados, em lista. */
export function intakeReadingWire(
  reading: IntakeReading = intakeReadingFixture(),
): IntakeReadingWire {
  const { vitals } = reading.structuredData;
  return {
    ...reading,
    structuredData: {
      ...reading.structuredData,
      vitals: READING_VITAL_SIGNS.flatMap((sign) => {
        const value = vitals[sign];
        return value === null ? [] : [{ sign, value }];
      }),
    },
  };
}

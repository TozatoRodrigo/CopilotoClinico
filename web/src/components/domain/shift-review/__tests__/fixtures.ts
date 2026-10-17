import type {
  ShiftReviewAnswerView,
  ShiftReviewCalibrationMap,
  ShiftReviewConfidence,
  ShiftReviewQuestionView,
  ShiftReviewView,
} from "@contracts/shift-review";

/** CC-801 — revisão como a API devolve: sem gabarito antes da resposta. */

export const multipleChoice: ShiftReviewQuestionView = {
  id: "50000000-0000-4000-8000-000000000001",
  position: 0,
  format: "multiple_choice",
  stem: "Em adulto com cefaleia súbita e intensa, qual é o exame inicial?",
  options: [
    "TC de crânio sem contraste",
    "Punção lombar antes da imagem",
    "Ressonância eletiva",
    "Nenhum exame",
  ],
  topic: "Cefaleia em trovoada",
  syndrome: "cefaleia",
  answer: null,
};

export const trueFalse: ShiftReviewQuestionView = {
  id: "50000000-0000-4000-8000-000000000002",
  position: 1,
  format: "true_false",
  stem: "Na sepse, o antimicrobiano deve começar na primeira hora.",
  options: ["Verdadeiro", "Falso"],
  topic: "Sepse",
  syndrome: "febre-hipotensao",
  answer: null,
};

export function answered(
  question: ShiftReviewQuestionView,
  chosenOption: number,
  confidence: ShiftReviewConfidence,
  correctOption: number,
  overrides: Partial<ShiftReviewAnswerView> = {},
): ShiftReviewQuestionView {
  return {
    ...question,
    answer: {
      chosenOption,
      confidence,
      correct: chosenOption === correctOption,
      correctOption,
      explanation: `Explicação de ${question.topic}: a fonte orienta assim.`,
      source: {
        title: "Diretriz de cefaleia na emergência",
        version: "2024",
        origin: "official_unreviewed",
        url: "https://example.org/cefaleia.pdf",
        excerpt: "Na cefaleia em trovoada, a TC sem contraste é o exame inicial.",
      },
      encounterId: "10000000-0000-4000-8000-000000000001",
      caseTitle: "Cefaleia súbita",
      answeredAt: "2026-10-15T15:00:00.000Z",
      ...overrides,
    },
  };
}

export function reviewWith(questions: ShiftReviewQuestionView[]): ShiftReviewView {
  const byConfidence = {
    know: { answered: 0, correct: 0 },
    unsure: { answered: 0, correct: 0 },
    guessed: { answered: 0, correct: 0 },
  };
  let answeredCount = 0;
  let correct = 0;
  for (const question of questions) {
    if (!question.answer) continue;
    answeredCount += 1;
    byConfidence[question.answer.confidence].answered += 1;
    if (question.answer.correct) {
      correct += 1;
      byConfidence[question.answer.confidence].correct += 1;
    }
  }
  return {
    id: "40000000-0000-4000-8000-000000000001",
    periodStart: "2026-10-12",
    generatedAt: "2026-10-15T14:00:00.000Z",
    completedAt: answeredCount === questions.length ? "2026-10-15T15:00:00.000Z" : null,
    questions,
    summary: { total: questions.length, answered: answeredCount, correct, byConfidence },
  };
}

/**
 * CC-802 — mapa como a API devolve: cefaleia com erro marcando "Sei" (com o
 * que estudar), dispneia acertando no chute e um tema com poucos dados.
 */
export function calibrationMap(
  overrides: Partial<ShiftReviewCalibrationMap> = {},
): ShiftReviewCalibrationMap {
  return {
    answered: 20,
    correct: 13,
    calibrated: 11,
    quadrants: { knew_right: 8, guessed_right: 5, knew_wrong: 4, guessed_wrong: 3 },
    minThemeAnswers: 3,
    themes: [
      {
        key: "syndrome:cefaleia",
        syndrome: "cefaleia",
        topics: ["Cefaleia em trovoada", "Hemorragia subaracnóidea"],
        answered: 10,
        status: "mapped",
        correct: 8,
        calibrated: 8,
        quadrants: { knew_right: 8, guessed_right: 0, knew_wrong: 2, guessed_wrong: 0 },
        studySuggestions: [
          {
            kind: "cited_source",
            title: "Diretriz de cefaleia na emergência",
            version: "2024",
            origin: "official_unreviewed",
            url: "https://example.org/cefaleia.pdf",
            excerpt: "Na cefaleia em trovoada, a TC sem contraste é o exame inicial.",
          },
          {
            kind: "knowledge_card",
            cardId: "70000000-0000-4000-8000-000000000001",
            title: "Cefaleia em trovoada",
            excerpt: "TC sem contraste nas primeiras 6 horas.",
          },
        ],
      },
      {
        key: "syndrome:dispneia",
        syndrome: "dispneia",
        topics: ["Asma"],
        answered: 8,
        status: "mapped",
        correct: 5,
        calibrated: 3,
        quadrants: { knew_right: 0, guessed_right: 5, knew_wrong: 0, guessed_wrong: 3 },
        studySuggestions: [],
      },
      {
        key: "topic:hipercalemia",
        syndrome: null,
        topics: ["Hipercalemia"],
        answered: 2,
        status: "few_answers",
      },
    ],
    ...overrides,
  };
}

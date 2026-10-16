import type { CitationOrigin, PsSyndrome } from './clinical';

/**
 * CC-801 — "Revise seu plantão": depois do plantão, até 3 perguntas geradas
 * das análises do próprio médico. Ele responde, marca o quanto sabia e vê a
 * explicação com a fonte que a análise citou.
 */

/**
 * "Sei", "tenho dúvida", "chutei" — o grau de certeza do método do Dr. Luiz.
 * Espelhado em web/src/lib/shift-review-contract.ts (a imagem do web não tem
 * ../src); tests/web-mirrors/shift-review.spec.ts confere.
 */
export const SHIFT_REVIEW_CONFIDENCES = ['know', 'unsure', 'guessed'] as const;
export type ShiftReviewConfidence = (typeof SHIFT_REVIEW_CONFIDENCES)[number];

export const SHIFT_REVIEW_QUESTION_FORMATS = ['multiple_choice', 'true_false'] as const;
export type ShiftReviewQuestionFormat = (typeof SHIFT_REVIEW_QUESTION_FORMATS)[number];

/** As duas alternativas do formato verdadeiro ou falso, nesta ordem. */
export const TRUE_FALSE_OPTIONS = ['Verdadeiro', 'Falso'] as const;

/** Fonte da pergunta: a que a análise citou, copiada pelo servidor. */
export interface ShiftReviewSource {
  title: string;
  version: string | null;
  origin: CitationOrigin | null;
  url: string | null;
  /** Trecho da fonte que sustenta a resposta. */
  excerpt: string;
}

/** Só existe depois da resposta: antes dela, a tela não recebe o gabarito. */
export interface ShiftReviewAnswerView {
  chosenOption: number;
  confidence: ShiftReviewConfidence;
  correct: boolean;
  correctOption: number;
  explanation: string;
  source: ShiftReviewSource;
  /** O caso de onde veio a pergunta, para o médico voltar a ele. */
  encounterId: string;
  caseTitle: string | null;
  answeredAt: string;
}

export interface ShiftReviewQuestionView {
  id: string;
  position: number;
  format: ShiftReviewQuestionFormat;
  stem: string;
  options: string[];
  topic: string;
  syndrome: PsSyndrome | null;
  answer: ShiftReviewAnswerView | null;
}

export interface ShiftReviewConfidenceTally {
  answered: number;
  correct: number;
}

/** Acertos × certeza da revisão: a semente do mapa de calibração (CC-802). */
export interface ShiftReviewSummary {
  total: number;
  answered: number;
  correct: number;
  byConfidence: Record<ShiftReviewConfidence, ShiftReviewConfidenceTally>;
}

export interface ShiftReviewView {
  id: string;
  /** Segunda-feira da semana da revisão (YYYY-MM-DD, horário de Brasília). */
  periodStart: string;
  generatedAt: string | null;
  completedAt: string | null;
  questions: ShiftReviewQuestionView[];
  summary: ShiftReviewSummary;
}

/**
 * Estado da revisão da semana, para o Plantão decidir se mostra a entrada e
 * a tela decidir o que desenhar.
 *
 * - `disabled`: `COPILOT_SHIFT_REVIEW` desligada.
 * - `unavailable`: sem análise na semana (ou as tentativas acabaram).
 * - `available`: há análises; abrir a revisão gera as perguntas.
 * - `generating`: perguntas sendo geradas; a tela consulta de novo.
 * - `ready`: perguntas prontas, ao menos uma sem resposta.
 * - `completed`: todas respondidas; a tela mostra o resumo.
 */
export type ShiftReviewState =
  | { status: 'disabled' }
  | { status: 'unavailable' }
  | { status: 'available' }
  | { status: 'generating' }
  | { status: 'ready'; review: ShiftReviewView }
  | { status: 'completed'; review: ShiftReviewView };

export type ShiftReviewStatus = ShiftReviewState['status'];

export interface AnswerShiftReviewQuestionRequest {
  chosenOption: number;
  confidence: ShiftReviewConfidence;
}

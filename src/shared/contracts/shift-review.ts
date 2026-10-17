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

/**
 * CC-802 — mapa de calibração: por tema, acerto × o quanto o médico sabia,
 * nos quadrantes do método do Dr. Luiz (avaliação por grau de certeza, à
 * maneira do Dunning-Kruger). "Tenho dúvida" e "Chutei" contam como "não
 * sabia": o médico não afirmou saber.
 *
 * - `knew_right`: sabe e sabe que sabe ("Sei" e acertou).
 * - `guessed_right`: acerta chutando (dúvida ou chute, e acertou).
 * - `knew_wrong`: erra com certeza ("Sei" e errou) — o perigoso.
 * - `guessed_wrong`: erra e sabe que não sabe.
 *
 * Calibração = respostas em que a certeza previu o acerto (`knew_right` +
 * `guessed_wrong`). Espelhado em web/src/lib/shift-review-contract.ts, nesta
 * ordem (linha a linha do quadro 2 × 2: acertou, errou).
 */
export const SHIFT_REVIEW_QUADRANTS = [
  'knew_right',
  'guessed_right',
  'knew_wrong',
  'guessed_wrong',
] as const;
export type ShiftReviewQuadrant = (typeof SHIFT_REVIEW_QUADRANTS)[number];

export type ShiftReviewQuadrantTally = Record<ShiftReviewQuadrant, number>;

/**
 * O que estudar num tema em que o médico errou marcando "Sei". Hoje são as
 * fontes que as próprias perguntas citaram; com os cartões revisados
 * (CC-402) entra `knowledge_card` (ver study-suggestions.ts na API).
 */
export type ShiftReviewStudySuggestion =
  | ({ kind: 'cited_source' } & ShiftReviewSource)
  | { kind: 'knowledge_card'; cardId: string; title: string; excerpt: string };

interface ShiftReviewMapThemeBase {
  /** `syndrome:<síndrome>` ou `topic:<tema normalizado>`. */
  key: string;
  /** Síndrome de PS do tema; `null` quando o tema é o texto da pergunta. */
  syndrome: PsSyndrome | null;
  /** Temas das perguntas, o mais frequente primeiro (é o rótulo sem síndrome). */
  topics: string[];
  answered: number;
}

/**
 * Um tema do mapa. Abaixo do mínimo de respostas o tema aparece só com a
 * contagem (`few_answers`): com 1–2 respostas não há conclusão a tirar.
 */
export type ShiftReviewMapTheme =
  | (ShiftReviewMapThemeBase & {
      status: 'mapped';
      correct: number;
      calibrated: number;
      quadrants: ShiftReviewQuadrantTally;
      /** Só nos temas com `knew_wrong` > 0. */
      studySuggestions: ShiftReviewStudySuggestion[];
    })
  | (ShiftReviewMapThemeBase & { status: 'few_answers' });

export interface ShiftReviewCalibrationMap {
  /** Respostas lidas (as mais recentes, até o teto da API). */
  answered: number;
  correct: number;
  calibrated: number;
  quadrants: ShiftReviewQuadrantTally;
  /** Respostas por tema para o tema sair do "poucos dados". */
  minThemeAnswers: number;
  /** Temas com erro marcando "Sei" primeiro; os de poucos dados por último. */
  themes: ShiftReviewMapTheme[];
}

/**
 * - `disabled`: `COPILOT_SHIFT_REVIEW` desligada.
 * - `insufficient`: menos respostas que o mínimo do mapa.
 * - `ready`: o mapa, só com as respostas do próprio médico.
 */
export type ShiftReviewMapState =
  | { status: 'disabled' }
  | { status: 'insufficient'; answered: number; required: number }
  | { status: 'ready'; map: ShiftReviewCalibrationMap };

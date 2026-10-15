import type { KnowledgeCardReviewerCredential } from './knowledge-cards';

/**
 * CC-501 — pergunta rápida: uma dúvida curta do plantão, sem abrir caso,
 * respondida só por cartões revisados publicados (ADR-019, emenda de
 * 15/10/2026). Nenhum texto gerado por IA neste fluxo: a resposta é o cartão,
 * com a dose estruturada, a fonte com o trecho citado e quem assinou.
 *
 * Só tipos e listas de valores: o web importa este arquivo pelo alias
 * `@contracts/*` e não tem o zod.
 */

/** Uma dúvida, não um relato: o caso inteiro tem o próprio fluxo. */
export const QUICK_QUESTION_MIN_LENGTH = 3;
export const QUICK_QUESTION_MAX_LENGTH = 300;

/** POST /quick-questions */
export interface AskQuickQuestionRequest {
  question: string;
}

/** GET /quick-questions/availability — a tela só mostra o campo com a flag ligada. */
export interface QuickQuestionAvailability {
  enabled: boolean;
}

/** Trecho literal de uma fonte do cartão; `sourceKey` é a chave dela em `sources` ("S1"). */
export interface QuickQuestionQuote {
  sourceKey: string;
  quote: string;
}

export const WEIGHT_DOSE_NOT_COMPUTED_REASONS = [
  /** A quantidade por kg não é um número e uma unidade ("0,01–0,02 mg/kg", texto livre). */
  'unparsed_amount',
  /** Dose por kg por tempo (mg/kg/dia, mcg/kg/min): a conta depende de divisão e intervalo. */
  'rate_or_daily',
  /** O teto do cartão está em outra unidade ou outra base (por dia): não dá para limitar a conta. */
  'max_dose_not_comparable',
  /** Peso fora de 0,5–200 kg. */
  'weight_out_of_range',
  /** Mais de um peso na pergunta, ou "1.500" (milhar ou decimal?). */
  'ambiguous_weight',
] as const;
export type WeightDoseNotComputedReason = (typeof WEIGHT_DOSE_NOT_COMPUTED_REASONS)[number];

/**
 * A dose por peso, calculada sobre a dose estruturada do cartão e o peso que
 * o médico escreveu na pergunta. Só multiplicação e o teto do próprio cartão;
 * qualquer coisa fora disso não calcula e diz por quê.
 */
export type WeightBasedDose =
  | { status: 'not_weight_based' }
  /** Dose por kg e nenhum peso na pergunta. */
  | { status: 'needs_weight' }
  | {
      status: 'computed';
      weightKg: number;
      /** A quantidade por kg como o cartão a escreve ("0,01 mg/kg"). */
      perKg: string;
      /** "0,2 mg" — já limitada ao teto do cartão quando `cappedAtMaxDose`. */
      total: string;
      cappedAtMaxDose: boolean;
    }
  | { status: 'not_computed'; reason: WeightDoseNotComputedReason };

/** A dose estruturada de uma afirmação do cartão, exatamente como foi assinada. */
export interface QuickQuestionDose {
  drug: string;
  amount: string;
  route: string | null;
  frequency: string | null;
  maxDose: string | null;
  /** A afirmação do cartão que traz a dose. */
  claim: string;
  citation: QuickQuestionQuote;
  weightBased: WeightBasedDose;
}

/** Fonte do cartão com os trechos que a resposta e as doses citam. */
export interface QuickQuestionSource {
  key: string;
  title: string;
  section: string | null;
  sourceVersion: string;
  url: string | null;
  quotes: string[];
}

/** Um cartão que responde à pergunta: o texto assinado, sem reescrita. */
export interface QuickQuestionCardAnswer {
  cardId: string;
  version: number;
  topic: string;
  /** A pergunta que o cartão responde — o médico confere se é a dele. */
  question: string;
  population: string | null;
  answer: string;
  answerQuotes: QuickQuestionQuote[];
  doses: QuickQuestionDose[];
  sources: QuickQuestionSource[];
  reviewer: KnowledgeCardReviewerCredential;
  reviewedAt: string;
  validUntil: string;
}

export const QUICK_QUESTION_OUTCOMES = ['answered', 'no_card', 'search_unavailable'] as const;
export type QuickQuestionOutcome = (typeof QUICK_QUESTION_OUTCOMES)[number];

/**
 * POST /quick-questions. `questionId` identifica a pergunta na trilha de
 * auditoria e no log; o texto não é guardado.
 */
export type QuickQuestionResponse =
  | { outcome: 'answered'; questionId: string; cards: QuickQuestionCardAnswer[] }
  /** Busca feita, nenhum cartão serve: a lacuna é registrada (CC-409). */
  | { outcome: 'no_card'; questionId: string; gapRecorded: boolean }
  /** Sem busca (embedding desligado ou fora do ar, portão falhou): não dá para dizer que falta cartão. */
  | { outcome: 'search_unavailable'; questionId: string };

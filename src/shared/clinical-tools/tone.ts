/**
 * Tom do resultado, sem cor: o motor diz o que o resultado significa e a tela
 * escolhe o token do design system (ADR-017, "Cores").
 *
 * - `neutral`: dentro do esperado / baixo risco. Verde do ANY. No Copiloto o
 *   verde é "conduta confirmada", então aqui vira cinza: um escore baixo não
 *   confirma conduta nenhuma.
 * - `attention`: risco intermediário, pede reavaliação. Amarelo do ANY; vira o
 *   laranja "muda a conduta".
 * - `critical`: alto risco, dose fora da faixa. Vermelho nos dois.
 *
 * O rótulo da faixa vai sempre junto: estado nunca só por cor.
 */
export const RESULT_TONES = ['neutral', 'attention', 'critical'] as const;
export type ResultTone = (typeof RESULT_TONES)[number];

/** Status de dose do ANY (`DoseStatus`): verde, amarelo e vermelho da régua de infusão. */
export type DoseStatus = 'therapeutic' | 'caution' | 'critical';

export const DOSE_STATUS_TONE: Record<DoseStatus, ResultTone> = {
  therapeutic: 'neutral',
  caution: 'attention',
  critical: 'critical',
};

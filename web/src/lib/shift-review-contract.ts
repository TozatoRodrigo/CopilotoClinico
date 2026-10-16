/**
 * CC-801 — espelho dos VALORES de src/shared/contracts/shift-review.ts que o
 * web usa em runtime.
 *
 * A imagem do web (docker/Dockerfile.web) copia só `web/`: de `@contracts/*`
 * o web importa só tipos. Mudou lá, muda aqui — tests/web-mirrors/shift-review.spec.ts
 * (raiz) falha se as duas cópias divergirem.
 */

/** "Sei", "tenho dúvida", "chutei", nesta ordem (a dos botões e do resumo). */
export const SHIFT_REVIEW_CONFIDENCES = ['know', 'unsure', 'guessed'] as const;

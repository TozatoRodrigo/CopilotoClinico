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

/**
 * CC-802 — quadrantes do mapa de calibração, na ordem do quadro 2 × 2
 * (acertou: sabia, chutou; errou: sabia, chutou).
 */
export const SHIFT_REVIEW_QUADRANTS = [
  'knew_right',
  'guessed_right',
  'knew_wrong',
  'guessed_wrong',
] as const;

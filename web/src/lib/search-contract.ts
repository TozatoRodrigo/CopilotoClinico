/**
 * CC-502 — espelho dos valores de `@contracts/search`. O web importa do
 * contrato só tipos (a imagem do web não leva `src/shared/contracts`); os
 * valores ficam aqui, e `tests/web-mirrors/search.spec.ts` confere que não
 * divergem.
 */

export const UNIFIED_SEARCH_GROUPS = ['cards', 'protocols', 'cases'] as const;
export const UNIFIED_SEARCH_MIN_CHARS = 2;
export const UNIFIED_SEARCH_MAX_CHARS = 100;
export const UNIFIED_SEARCH_DEFAULT_LIMIT = 5;
export const UNIFIED_SEARCH_MAX_LIMIT = 10;

/**
 * CC-334 — `fetch` injetável: os testes trocam por um provedor falso (JWKS e
 * endpoint de token) sem rede.
 */
export const OAUTH_FETCH = Symbol('OAUTH_FETCH');

export type OAuthFetch = typeof fetch;

/** Teto de cada chamada ao provedor (troca do código, JWKS). */
export const OAUTH_HTTP_TIMEOUT_MS = 10_000;

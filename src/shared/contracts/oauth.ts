/**
 * CC-334 — contrato do login com Google ou Microsoft, compartilhado entre a API
 * (src/modules/auth/oauth) e o web (página /login/oauth e botões do login).
 *
 * O fluxo OAuth roda inteiro no backend: o navegador vai a
 * `GET /auth/oauth/:provider/start`, passa pelo provedor e volta a
 * `GET /auth/oauth/:provider/callback`, que redireciona para
 * `/login/oauth?status=…` no web. O que a página precisa para continuar
 * (código MFA, cadastro com CRM, vínculo com senha) vem de
 * `GET /auth/oauth/pending`, lido de um cookie httpOnly — nunca da URL.
 */
import type { Physician } from './clinical';

export const oauthProviderValues = ['google', 'microsoft'] as const;

export type OAuthProviderId = (typeof oauthProviderValues)[number];

/** `GET /auth/oauth/providers` — só os provedores com cliente configurado. */
export interface OAuthProvidersResponse {
  providers: OAuthProviderId[];
}

/** Desfecho do callback, levado em `?status=` para a página /login/oauth. */
export const oauthCallbackStatusValues = ['ok', 'mfa', 'signup', 'link', 'error'] as const;

export type OAuthCallbackStatus = (typeof oauthCallbackStatusValues)[number];

/** Motivo de `status=error`, levado em `?reason=`. */
export const oauthErrorReasonValues = [
  // Provedor sem cliente configurado (ou configuração incompleta).
  'unavailable',
  // O usuário desistiu na tela do provedor.
  'cancelled',
  // state ausente, expirado ou diferente do cookie do fluxo (CSRF de login).
  'state_mismatch',
  // O provedor devolveu erro ou a troca do código falhou.
  'provider_error',
  // id_token inválido: assinatura, iss, aud, exp ou nonce.
  'invalid_token',
  // O provedor não garante o e-mail; sem ele não se cria nem se vincula conta.
  'email_unverified',
] as const;

export type OAuthErrorReason = (typeof oauthErrorReasonValues)[number];

/** `GET /auth/oauth/pending` — o passo que falta depois do callback. */
export type OAuthPendingResponse =
  | { kind: 'none' }
  | { kind: 'mfa'; provider: OAuthProviderId; mfaToken: string }
  | { kind: 'signup'; provider: OAuthProviderId; email: string; name: string | null }
  | { kind: 'link'; provider: OAuthProviderId; email: string };

/** `POST /auth/oauth/signup` — conta nova: o CRM é obrigatório, como no cadastro. */
export interface OAuthSignupRequest {
  crmUf: string;
  crmNumber: string;
  name?: string;
}

/** `POST /auth/oauth/link` — conta existente com o mesmo e-mail: a senha confirma o vínculo. */
export interface OAuthLinkRequest {
  password: string;
}

export type OAuthLinkResponse =
  | { mfaRequired: true; mfaToken: string }
  | { mfaRequired: false; physician: Physician };

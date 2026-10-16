import type { OAuthCallbackStatus, OAuthErrorReason } from '@/lib/types';

/**
 * Mensagem de cada motivo de erro do callback. `Record` sobre o tipo do
 * contrato: um motivo novo na API sem mensagem aqui quebra o typecheck.
 */
export const OAUTH_ERROR_MESSAGES: Record<OAuthErrorReason, string> = {
  unavailable: 'O login com esse provedor não está disponível agora. Entre com e-mail e senha.',
  cancelled: 'O login foi cancelado na tela do provedor.',
  state_mismatch: 'O login expirou ou foi aberto em outra aba. Tente de novo.',
  provider_error: 'O provedor não respondeu como esperado. Tente de novo em instantes.',
  invalid_token: 'Não conseguimos confirmar sua identidade com o provedor. Tente de novo.',
  email_unverified:
    'O provedor não confirmou o seu e-mail. Use uma conta com e-mail verificado ou entre com e-mail e senha.',
};

const STATUSES: Record<OAuthCallbackStatus, true> = {
  ok: true,
  mfa: true,
  signup: true,
  link: true,
  error: true,
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is OAuthCallbackStatus {
  return value !== undefined && Object.hasOwn(STATUSES, value);
}

function isReason(value: string | undefined): value is OAuthErrorReason {
  return value !== undefined && Object.hasOwn(OAUTH_ERROR_MESSAGES, value);
}

/** Query da página; qualquer valor fora do contrato vira erro genérico. */
export function parseOAuthLandingParams(params: Record<string, string | string[] | undefined>): {
  status: OAuthCallbackStatus;
  reason: OAuthErrorReason | null;
} {
  const status = first(params.status);
  const reason = first(params.reason);
  if (!isStatus(status)) return { status: 'error', reason: 'provider_error' };
  return {
    status,
    reason: status === 'error' ? (isReason(reason) ? reason : 'provider_error') : null,
  };
}

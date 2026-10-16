/**
 * CC-014 — o consentimento "Analytics" (Configurações → Privacidade) aplicado
 * ao Umami. Antes era só gravado: a contagem seguia igual depois da revogação.
 *
 * Duas travas:
 * - o script do Umami não carrega para quem revogou (`UmamiScript`, pelo hook
 *   `useAnalyticsAllowed`);
 * - a chave `umami.disabled` no localStorage, que o próprio script do Umami
 *   confere antes de cada envio (pageview ou evento). Ela para um script que
 *   já estava carregado quando o médico revogou e vale neste navegador depois
 *   do logout. Sem o script, nenhum evento sai: `window.umami` não existe.
 */

/** Lida pelo script do Umami: com valor, nada é enviado (umami.is/docs/exclude-my-own-visits). */
export const UMAMI_DISABLED_KEY = 'umami.disabled';

/** O que importa de cada escopo em GET /lgpd/consent. */
export interface ConsentStatus {
  scope: string;
  granted: boolean;
  revokedAt: string | null;
}

export function isConsentStatus(value: unknown): value is ConsentStatus {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.scope === 'string' &&
    typeof candidate.granted === 'boolean' &&
    (candidate.revokedAt === null || typeof candidate.revokedAt === 'string')
  );
}

/**
 * Revogado é o registro mais recente de `analytics` fechado pelo médico. Sem
 * registro a contagem segue como sempre foi (visitas sem cookie para todos):
 * a trava é a revogação, não a falta de aceite.
 */
export function isAnalyticsRevoked(consents: readonly ConsentStatus[]): boolean {
  const analytics = consents.find((consent) => consent.scope === 'analytics');
  return analytics !== undefined && !analytics.granted && analytics.revokedAt !== null;
}

/** Este navegador está fora da contagem? Storage bloqueado conta como "não". */
export function readAnalyticsOptOut(): boolean {
  try {
    return Boolean(window.localStorage.getItem(UMAMI_DISABLED_KEY));
  } catch {
    return false;
  }
}

export function writeAnalyticsOptOut(optOut: boolean): void {
  try {
    if (optOut) {
      window.localStorage.setItem(UMAMI_DISABLED_KEY, '1');
    } else {
      window.localStorage.removeItem(UMAMI_DISABLED_KEY);
    }
  } catch {
    // Storage bloqueado: sem a chave, a revogação ainda impede o script de carregar.
  }
}

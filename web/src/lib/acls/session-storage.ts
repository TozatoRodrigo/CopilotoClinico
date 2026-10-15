import { parseAclsState, type AclsState } from '@clinical-tools/acls/session';

/**
 * A parada em curso fica guardada no aparelho para sobreviver a um
 * recarregamento da aba (o iOS descarta aba em segundo plano; o médico pode
 * puxar a página para baixo sem querer). Só o estado do roteiro: horários,
 * ritmo, contadores e linha do tempo, sem nada que identifique o paciente.
 * Nada vai para o servidor.
 *
 * Parada esquecida não volta para sempre: depois de 12 h do início ela é
 * descartada ao abrir o app.
 */

export const ACLS_SESSION_KEY = 'copiloto:ferramentas:acls:parada';
export const ACLS_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadAclsSession(now: number): AclsState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(ACLS_SESSION_KEY);
    if (!raw) return null;
    const state = parseAclsState(JSON.parse(raw));
    const stale = state?.startedAt != null && now - state.startedAt > ACLS_SESSION_MAX_AGE_MS;
    if (!state || state.status === 'idle' || stale) {
      store.removeItem(ACLS_SESSION_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function saveAclsSession(state: AclsState): void {
  const store = storage();
  if (!store) return;
  try {
    if (state.status === 'idle') store.removeItem(ACLS_SESSION_KEY);
    else store.setItem(ACLS_SESSION_KEY, JSON.stringify(state));
  } catch {
    /* aba privada ou cota cheia: a parada segue só na memória */
  }
}

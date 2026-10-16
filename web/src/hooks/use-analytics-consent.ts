'use client';

/**
 * CC-014 — pode contar visitas e eventos no Umami? É a pergunta que o
 * carregador do script (`UmamiScript`) faz. Ver lib/analytics-consent.ts.
 *
 * - Visitante sem login (landing, cadastro, /privacidade): conta, salvo se
 *   este navegador ficou de fora quando o último médico revogou.
 * - Médico logado: decide o consentimento dele no servidor. Enquanto a
 *   resposta não chega, não carrega; se ela falhar, vale o que este navegador
 *   lembra.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  isAnalyticsRevoked,
  isConsentStatus,
  readAnalyticsOptOut,
  writeAnalyticsOptOut,
  type ConsentStatus,
} from '@/lib/analytics-consent';

/**
 * Debaixo de ['lgpd', 'consents']: revogar ou conceder em Configurações →
 * Privacidade invalida essa chave e, com ela, esta. O id do médico separa o
 * cache de quem entra depois no mesmo navegador.
 */
function analyticsConsentQueryKey(physicianId: string | undefined) {
  return ['lgpd', 'consents', 'analytics', physicianId] as const;
}

/**
 * `fetch` direto, não o apiClient: o script vive no layout raiz, e um 401
 * aqui (sessão vencida numa página pública) não pode levar o visitante ao
 * login como o apiClient faz.
 */
async function fetchConsentsQuietly(): Promise<ConsentStatus[]> {
  const response = await fetch(`${API_BASE_URL}/lgpd/consent`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`GET /lgpd/consent respondeu ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error('GET /lgpd/consent sem lista de consentimentos');
  }
  return body.filter(isConsentStatus);
}

export function useAnalyticsAllowed(): boolean {
  const { physician, isLoading } = useAuth();
  const signedIn = physician !== null;

  const consents = useQuery({
    queryKey: analyticsConsentQueryKey(physician?.id),
    queryFn: fetchConsentsQuietly,
    enabled: signedIn,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const revoked = signedIn && consents.data ? isAnalyticsRevoked(consents.data) : undefined;

  // O navegador acompanha o médico logado: fica de fora com quem revogou e
  // volta a contar com quem não revogou (terminal compartilhado no plantão).
  useEffect(() => {
    if (revoked !== undefined) writeAnalyticsOptOut(revoked);
  }, [revoked]);

  if (isLoading) return false;
  if (!signedIn) return !readAnalyticsOptOut();
  if (revoked !== undefined) return !revoked;
  if (consents.isError) return !readAnalyticsOptOut();
  return false;
}

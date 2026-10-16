'use client';

import Script from 'next/script';
import { useAnalyticsAllowed } from '@/hooks/use-analytics-consent';

/**
 * Umami autoalojado (sem cookie, sem PII). CC-014: não carrega para o médico
 * que revogou "Analytics" em Configurações → Privacidade; ver
 * hooks/use-analytics-consent.ts. Precisa ficar dentro do AuthProvider e do
 * QueryProvider.
 */
export function UmamiScript({ src, websiteId }: { src: string; websiteId: string }) {
  const allowed = useAnalyticsAllowed();
  if (!allowed) return null;
  return <Script src={src} data-website-id={websiteId} strategy="afterInteractive" />;
}

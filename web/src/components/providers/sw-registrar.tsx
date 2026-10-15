'use client';

import { useEffect } from 'react';
import { startToolsOfflineSync } from '@/lib/tools-offline';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // CC-322 — as Ferramentas ficam no aparelho desde a primeira abertura com
    // sinal, em qualquer tela, e se atualizam quando o sinal volta.
    return startToolsOfflineSync();
  }, []);

  return null;
}

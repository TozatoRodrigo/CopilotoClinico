'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { WifiSlash } from '@phosphor-icons/react';

interface OnlineContextValue {
  isOnline: boolean;
}

let onlineListeners: Array<() => void> = [];
let cachedOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

function subscribeOnline(callback: () => void) {
  onlineListeners.push(callback);
  return () => {
    onlineListeners = onlineListeners.filter((l) => l !== callback);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    cachedOnline = true;
    onlineListeners.forEach((l) => l());
  });
  window.addEventListener('offline', () => {
    cachedOnline = false;
    onlineListeners.forEach((l) => l());
  });
}

function getSnapshot(): boolean {
  return cachedOnline;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): OnlineContextValue {
  const isOnline = useSyncExternalStore(subscribeOnline, getSnapshot, getServerSnapshot);
  return { isOnline };
}

/**
 * Aviso de sem conexão. Nas Ferramentas (CC-322) o aviso diz o que importa à
 * beira-leito: as ferramentas funcionam sem sinal (o service worker guardou
 * tudo) e só a análise do caso espera a conexão.
 */
export function offlineMessage(pathname: string | null): string {
  if (pathname === '/ferramentas' || pathname?.startsWith('/ferramentas/')) {
    return 'Sem conexão: ferramentas funcionam, análise do caso fica na fila.';
  }
  return 'Sem conexão. Você pode continuar — tudo será enviado ao reconectar.';
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { isOnline } = useOnlineStatus();
  const pathname = usePathname();

  return (
    <>
      {!isOnline && (
        <div
          role="status"
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-tone-orange-bg px-4 py-2 text-tone-orange-ink"
        >
          <WifiSlash className="size-4 shrink-0 text-tone-orange" aria-hidden="true" />
          <p className="text-[0.8125rem] leading-snug">{offlineMessage(pathname)}</p>
        </div>
      )}
      {children}
    </>
  );
}

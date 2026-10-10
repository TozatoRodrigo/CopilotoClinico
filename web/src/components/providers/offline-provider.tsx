"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { WifiSlash } from "@phosphor-icons/react";

interface OnlineContextValue {
  isOnline: boolean;
}

let onlineListeners: Array<() => void> = [];
let cachedOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

function subscribeOnline(callback: () => void) {
  onlineListeners.push(callback);
  return () => {
    onlineListeners = onlineListeners.filter((l) => l !== callback);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    cachedOnline = true;
    onlineListeners.forEach((l) => l());
  });
  window.addEventListener("offline", () => {
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
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getSnapshot,
    getServerSnapshot,
  );
  return { isOnline };
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { isOnline } = useOnlineStatus();

  return (
    <>
      {!isOnline && (
        <div
          role="status"
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-tone-orange-bg px-4 py-2 text-tone-orange-ink"
        >
          <WifiSlash className="size-4 shrink-0 text-tone-orange" aria-hidden="true" />
          <p className="text-[0.8125rem] leading-snug">
            Sem conexão. Você pode continuar — tudo será enviado ao reconectar.
          </p>
        </div>
      )}
      {children}
    </>
  );
}

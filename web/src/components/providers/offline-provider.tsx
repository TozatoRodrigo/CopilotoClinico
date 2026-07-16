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
          className="sticky top-0 z-50 flex items-center gap-2.5 px-4 py-2.5"
          style={{
            background: "var(--amber-bg)",
            borderBottom: "1px solid rgba(180,83,9,0.35)",
          }}
        >
          <WifiSlash className="size-4 shrink-0" style={{ color: "var(--amber)" }} />
          <p className="text-[0.75rem] leading-snug" style={{ color: "var(--amber-foreground)" }}>
            Sem conexão. Você pode continuar — tudo será enviado ao reconectar.
          </p>
        </div>
      )}
      {children}
    </>
  );
}

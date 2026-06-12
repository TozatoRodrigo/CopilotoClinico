"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ConnectionStatus } from "@/components/domain/connection-status";

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
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-clinical-amber/30 bg-clinical-amber-bg px-4 py-2 text-center text-sm text-clinical-amber-foreground">
          <ConnectionStatus status="offline" />
          <span>Funcionalidades limitadas até a conexão ser restabelecida.</span>
        </div>
      )}
      {children}
    </>
  );
}

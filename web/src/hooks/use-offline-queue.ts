'use client';

/**
 * S23-CLIN-03 — Hook para expor o estado da fila offline no shell.
 *
 * Lê a IndexedDB via `getQueue()` e reage a mudanças (online/offline +
 * invalidação manual). Permite que o badge no header mostre contagem
 * atualizada e o painel liste os itens pendentes.
 *
 * Integra com `syncOfflineQueue` (que processa a fila quando volta online):
 * quando `isOnline` vira true, faz refresh periódico até a fila esvaziar
 * ou estourar tentativas.
 */
import { useCallback, useEffect, useState } from 'react';
import { getQueue, removeFromQueue, type QueueItem } from '@/lib/offline-queue';
import { syncOfflineQueue } from '@/lib/copilot-queue';
import { useOnlineStatus } from '@/components/providers/offline-provider';

export interface UseOfflineQueueResult {
  items: QueueItem[];
  count: number;
  isSyncing: boolean;
  lastSyncResult: { processed: number; failed: number } | null;
  refresh: () => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

export function useOfflineQueue(): UseOfflineQueueResult {
  const { isOnline } = useOnlineStatus();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    processed: number;
    failed: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const queue = await getQueue();
      setItems(queue.sort((a, b) => a.createdAt - b.createdAt));
    } catch {
      // IndexedDB pode falhar em modos privados do Safari — silently ignore.
    }
  }, []);

  const removeItem = useCallback(
    async (id: string) => {
      await removeFromQueue(id);
      await refresh();
    },
    [refresh],
  );

  const syncNow = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncOfflineQueue();
      setLastSyncResult({ processed: result.processed, failed: result.failed });
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refresh]);

  // Refresh inicial + quando volta online (dispara sync automaticamente).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isOnline) return;
    // Online: tenta sincronizar; se ainda houver itens (falhas), refaz a cada 5s.
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 12; // 1 minuto

    const tick = async () => {
      if (cancelled) return;
      await syncNow();
      attempts += 1;
      const remaining = await getQueue();
      if (remaining.length > 0 && attempts < MAX_ATTEMPTS && !cancelled) {
        setTimeout(tick, 5000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return {
    items,
    count: items.length,
    isSyncing,
    lastSyncResult,
    refresh,
    removeItem,
    syncNow,
  };
}

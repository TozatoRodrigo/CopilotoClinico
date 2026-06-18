import type { ClarifyingAnswer, EncounterContext } from "@/lib/types";

interface AnalyzeQueueItem {
  id: string;
  type: "analyze";
  encounterId: string;
  caseText: string;
  context: EncounterContext;
  /**
   * S20-CLIN-01 — red flags explícitas marcadas pelo médico.
   * Persistidas na fila offline para serem enviadas ao reconectar,
   * garantindo rastreabilidade mesmo em cenário offline.
   */
  redFlags: Record<string, boolean>;
  createdAt: number;
}

interface RespondQueueItem {
  id: string;
  type: "respond";
  encounterId: string;
  interactionId: string;
  answers: ClarifyingAnswer[];
  createdAt: number;
}

export type QueueItem = AnalyzeQueueItem | RespondQueueItem;

const DB_NAME = "copiloto_offline_queue";
const DB_VERSION = 1;
const STORE_NAME = "queue";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function addToQueue(
  item:
    | Omit<AnalyzeQueueItem, "id" | "createdAt">
    | Omit<RespondQueueItem, "id" | "createdAt">,
): Promise<void> {
  const queueItem: QueueItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  } as QueueItem;
  await withStore("readwrite", (store) => store.add(queueItem));
}

export async function getQueue(): Promise<QueueItem[]> {
  return withStore<QueueItem[]>("readonly", (store) =>
    store.getAll(),
  );
}

export async function clearQueue(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}

export async function removeFromQueue(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function processQueue(
  sendFn: (
    item: QueueItem,
  ) => Promise<{ success: boolean; encounterId: string }>,
): Promise<{ processed: number; failed: number }> {
  const items = await getQueue();
  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await sendFn(item);
      if (result.success) {
        await removeFromQueue(item.id);
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

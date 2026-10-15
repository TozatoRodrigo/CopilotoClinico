'use client';

/**
 * F0-D — decisões do médico por recomendação (adotar / rejeitar / anotar),
 * persistidas no servidor.
 *
 * Origem: até aqui (S23-CLIN-06) viviam só no sessionStorage — o sinal mais
 * direto de "o copiloto acertou?" morria com a aba do plantão e a equipe
 * nunca via uma conduta ser rejeitada sistematicamente.
 *
 * - Fonte da verdade: GET /encounters/:id/copilot/decisions?interactionId=.
 * - Atualização otimista: a tela muda no clique; o envio vem logo depois
 *   (notas com um pequeno atraso, para não mandar uma requisição por tecla).
 * - sessionStorage só como fallback offline: guarda o que ainda não foi
 *   confirmado pelo servidor e reenvia ao montar a tela e quando a conexão
 *   volta. Confirmado, sai do storage.
 *
 * Regra de mapeamento dos botões para o enum do servidor:
 *   Adotar                → `adopted` (ou `modified`, se já houver nota)
 *   Rejeitar              → `rejected` (a nota, se houver, vira o motivo)
 *   Anotar (com texto)    → `modified` — adotada com ajuste —, exceto se já
 *                           rejeitada (continua `rejected`)
 *   Apagar a nota         → volta para `adopted` (se não estava rejeitada)
 * Nota sem decisão prévia conta como adoção com ajuste, como já contava antes
 * (o hook antigo gravava `adopted` + nota).
 *
 * Chaveado por análise (`interactionId`), não só por encontro: depois de uma
 * reanálise a recomendação de índice 0 é outra, e a decisão antiga não pode
 * aparecer nela.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiClient } from '@/lib/api-client';
import { clinicalQueryKeys } from '@/lib/clinical-queries';
import { Sentry } from '@/lib/sentry';
import type {
  RecommendationDecisionRecord,
  RecommendationDecisionValue,
  UpsertRecommendationDecisionRequest,
} from '@/lib/types';

export type RecommendationDecision = RecommendationDecisionValue;

/** Os dois botões de decisão da tela; `modified` só nasce de uma nota. */
export type RecommendationDecisionClick = Extract<RecommendationDecision, 'adopted' | 'rejected'>;

export interface RecommendationDecisionState {
  decision: RecommendationDecision;
  note?: string;
  decidedAt: string; // ISO timestamp
}

/** Chave = índice da recomendação na análise, como string. */
export type DecisionsMap = Record<string, RecommendationDecisionState>;

/** Decisão ainda não confirmada pelo servidor; `syncFailed` = a última tentativa falhou. */
interface PendingDecision extends RecommendationDecisionState {
  syncFailed?: boolean;
}

type PendingDecisions = Record<string, PendingDecision>;

export type DecisionsSyncStatus = 'saved' | 'saving' | 'offline';

export interface UseRecommendationDecisionsResult {
  decisions: DecisionsMap;
  setDecision: (recId: string, click: RecommendationDecisionClick) => void;
  setNote: (recId: string, note: string) => void;
  counts: { adopted: number; modified: number; rejected: number; pending: number };
  syncStatus: DecisionsSyncStatus;
  retryPending: () => void;
}

/** Espera depois da última tecla antes de enviar a nota. */
export const NOTE_SYNC_DELAY_MS = 800;

const NO_DECISIONS: PendingDecisions = {};

export function decisionAfterClick(
  click: RecommendationDecisionClick,
  current: RecommendationDecisionState | undefined,
): RecommendationDecision {
  if (click === 'rejected') return 'rejected';
  return current?.note?.trim() ? 'modified' : 'adopted';
}

export function decisionAfterNote(
  note: string,
  current: RecommendationDecisionState | undefined,
): RecommendationDecision {
  if (current?.decision === 'rejected') return 'rejected';
  return note.trim() ? 'modified' : 'adopted';
}

// ── Fallback offline: decisões ainda não confirmadas pelo servidor ─────────
// Store externo (useSyncExternalStore) com cache em memória: continua
// funcionando quando o sessionStorage está indisponível (modo privado, cota).

const pendingCache = new Map<string, PendingDecisions>();
const pendingListeners = new Set<() => void>();

export function pendingStorageKey(encounterId: string, interactionId: string): string {
  return `copiloto:decisions:${encounterId}:${interactionId}`;
}

function readPending(key: string): PendingDecisions {
  const cached = pendingCache.get(key);
  if (cached) return cached;
  let stored = NO_DECISIONS;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) stored = JSON.parse(raw) as PendingDecisions;
  } catch {
    // JSON inválido ou storage indisponível — começa sem pendências.
  }
  pendingCache.set(key, stored);
  return stored;
}

function writePending(key: string, next: PendingDecisions): void {
  pendingCache.set(key, next);
  try {
    if (Object.keys(next).length === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Cota / modo privado: o cache em memória ainda cobre esta sessão.
  }
  pendingListeners.forEach((listener) => listener());
}

function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

function rememberPending(key: string, recId: string, state: RecommendationDecisionState): void {
  writePending(key, { ...readPending(key), [recId]: state });
}

/** Tira do fallback só se nada mais novo foi decidido enquanto o envio viajava. */
function forgetPending(key: string, recId: string, decidedAt: string): void {
  const current = readPending(key);
  if (current[recId]?.decidedAt !== decidedAt) return;
  const rest = { ...current };
  delete rest[recId];
  writePending(key, rest);
}

function markPendingFailed(key: string, recId: string, decidedAt: string): void {
  const current = readPending(key);
  const entry = current[recId];
  if (entry?.decidedAt !== decidedAt || entry.syncFailed) return;
  writePending(key, { ...current, [recId]: { ...entry, syncFailed: true } });
}

/** Erro do cliente (4xx) não melhora com retry; rede e 5xx, sim. */
function isPermanentFailure(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}

function toState(record: RecommendationDecisionRecord): RecommendationDecisionState {
  return {
    decision: record.decision,
    note: record.note ?? undefined,
    decidedAt: record.updatedAt,
  };
}

function upsertRecord(
  records: RecommendationDecisionRecord[] | undefined,
  saved: RecommendationDecisionRecord,
): RecommendationDecisionRecord[] {
  return [
    ...(records ?? []).filter((record) => record.recommendationIndex !== saved.recommendationIndex),
    saved,
  ];
}

export function useRecommendationDecisions(
  encounterId: string,
  interactionId: string,
  totalRecommendations: number,
): UseRecommendationDecisionsResult {
  const queryClient = useQueryClient();
  const storageKey = pendingStorageKey(encounterId, interactionId);
  const pending = useSyncExternalStore(
    subscribePending,
    () => readPending(storageKey),
    () => NO_DECISIONS,
  );
  const noteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const savedQuery = useQuery({
    queryKey: clinicalQueryKeys.recommendationDecisions(encounterId, interactionId),
    queryFn: () =>
      apiClient.get<RecommendationDecisionRecord[]>(
        `/encounters/${encounterId}/copilot/decisions`,
        { interactionId },
      ),
  });

  const { mutateAsync: putDecision } = useMutation({
    mutationFn: (body: UpsertRecommendationDecisionRequest) =>
      apiClient.put<RecommendationDecisionRecord>(
        `/encounters/${encounterId}/copilot/decisions`,
        body,
      ),
  });

  const send = useCallback(
    async (recId: string, state: RecommendationDecisionState) => {
      try {
        const saved = await putDecision({
          interactionId,
          recommendationIndex: Number(recId),
          decision: state.decision,
          note: state.note?.trim() ? state.note : null,
        });
        queryClient.setQueryData<RecommendationDecisionRecord[]>(
          clinicalQueryKeys.recommendationDecisions(encounterId, interactionId),
          (records) => upsertRecord(records, saved),
        );
        forgetPending(storageKey, recId, state.decidedAt);
      } catch (err) {
        if (!isPermanentFailure(err)) {
          markPendingFailed(storageKey, recId, state.decidedAt);
          return;
        }
        // Recusa do servidor (análise alheia, índice inválido): reenviar não
        // adianta. Volta ao estado do servidor e avisa — e a equipe vê no Sentry.
        forgetPending(storageKey, recId, state.decidedAt);
        Sentry.captureException(err, { tags: { area: 'recommendation-decisions' } });
        toast.error('Não foi possível registrar a decisão sobre esta conduta.');
      }
    },
    [putDecision, queryClient, encounterId, interactionId, storageKey],
  );

  const retryPending = useCallback(() => {
    for (const [recId, state] of Object.entries(readPending(storageKey))) {
      void send(recId, state);
    }
  }, [send, storageKey]);

  // Reenvia o que ficou só neste dispositivo: ao abrir a análise e quando a
  // conexão volta. Não é busca de dados — é a fila de escrita offline.
  useEffect(() => {
    retryPending();
    window.addEventListener('online', retryPending);
    return () => window.removeEventListener('online', retryPending);
  }, [retryPending]);

  // Nota com envio agendado não se perde ao sair da tela: envia na hora.
  useEffect(() => {
    const timers = noteTimers.current;
    return () => {
      for (const [recId, timer] of timers) {
        clearTimeout(timer);
        const state = readPending(storageKey)[recId];
        if (state) void send(recId, state);
      }
      timers.clear();
    };
  }, [send, storageKey]);

  const decisions = useMemo<DecisionsMap>(() => {
    const saved = Object.fromEntries(
      (savedQuery.data ?? []).map((record) => [String(record.recommendationIndex), toState(record)]),
    );
    return { ...saved, ...pending };
  }, [savedQuery.data, pending]);

  const setDecision = useCallback(
    (recId: string, click: RecommendationDecisionClick) => {
      const current = decisions[recId];
      const next: RecommendationDecisionState = {
        decision: decisionAfterClick(click, current),
        note: current?.note,
        decidedAt: new Date().toISOString(),
      };
      rememberPending(storageKey, recId, next);
      void send(recId, next);
    },
    [decisions, send, storageKey],
  );

  const setNote = useCallback(
    (recId: string, note: string) => {
      const current = decisions[recId];
      const next: RecommendationDecisionState = {
        decision: decisionAfterNote(note, current),
        note,
        decidedAt: new Date().toISOString(),
      };
      rememberPending(storageKey, recId, next);

      const timers = noteTimers.current;
      clearTimeout(timers.get(recId));
      timers.set(
        recId,
        setTimeout(() => {
          timers.delete(recId);
          void send(recId, next);
        }, NOTE_SYNC_DELAY_MS),
      );
    },
    [decisions, send, storageKey],
  );

  const values = Object.values(decisions);
  const adopted = values.filter((d) => d.decision === 'adopted').length;
  const modified = values.filter((d) => d.decision === 'modified').length;
  const rejected = values.filter((d) => d.decision === 'rejected').length;
  const pendingDecisions = Object.values(pending);
  const syncStatus: DecisionsSyncStatus =
    pendingDecisions.length === 0
      ? 'saved'
      : pendingDecisions.some((entry) => entry.syncFailed)
        ? 'offline'
        : 'saving';

  return {
    decisions,
    setDecision,
    setNote,
    counts: {
      adopted,
      modified,
      rejected,
      pending: Math.max(0, totalRecommendations - adopted - modified - rejected),
    },
    syncStatus,
    retryPending,
  };
}

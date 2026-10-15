'use client';

import { useCallback, useState } from 'react';
import {
  addToHistory,
  createAclsHistoryRecord,
  nextReportNumber,
  parseAclsHistory,
  type AclsHistoryRecord,
} from '@clinical-tools/acls/history';
import type { AclsState } from '@clinical-tools/acls/session';

/**
 * Histórico de paradas no aparelho (CC-314; decisão no ADR-017, item 9).
 * Cada parada encerrada vira um registro com o resumo e o relatório, sem
 * identificação do paciente; nada vai para o servidor. O médico apaga um
 * registro ou todos na tela de atendimentos salvos.
 */

export const ACLS_HISTORY_KEY = 'copiloto:ferramentas:acls:historico';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readAclsHistory(): AclsHistoryRecord[] {
  try {
    const raw = storage()?.getItem(ACLS_HISTORY_KEY);
    return raw ? parseAclsHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeAclsHistory(records: readonly AclsHistoryRecord[]): boolean {
  const store = storage();
  if (!store) return false;
  try {
    if (records.length === 0) store.removeItem(ACLS_HISTORY_KEY);
    else store.setItem(ACLS_HISTORY_KEY, JSON.stringify(records));
    return true;
  } catch {
    // Aba privada ou cota cheia: o relatório continua na tela para copiar.
    return false;
  }
}

function newRecordId(): string {
  // Como no ANY (BLOCKER-05): id aleatório, para dois registros no mesmo
  // milissegundo não colidirem.
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Guarda a parada encerrada e devolve o registro (com o número do atendimento). */
export function saveAclsRecord(state: AclsState): AclsHistoryRecord | null {
  const records = readAclsHistory();
  const record = createAclsHistoryRecord(state, {
    id: newRecordId(),
    number: nextReportNumber(records),
  });
  if (!record) return null;
  writeAclsHistory(addToHistory(records, record));
  return record;
}

export function deleteAclsRecord(id: string): AclsHistoryRecord[] {
  const next = readAclsHistory().filter((record) => record.id !== id);
  writeAclsHistory(next);
  return next;
}

export function clearAclsHistory(): void {
  writeAclsHistory([]);
}

export function useAclsHistory() {
  // As páginas de (app) só montam no cliente, depois do login: ler o
  // aparelho no inicializador é seguro (mesmo padrão dos favoritos).
  const [records, setRecords] = useState<AclsHistoryRecord[]>(readAclsHistory);
  const remove = useCallback((id: string) => setRecords(deleteAclsRecord(id)), []);
  const clear = useCallback(() => {
    clearAclsHistory();
    setRecords([]);
  }, []);
  return { records, remove, clear };
}

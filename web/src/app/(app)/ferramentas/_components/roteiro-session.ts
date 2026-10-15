'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';

/**
 * Estado dos roteiros das Ferramentas na aba (sessionStorage): quem sai do
 * Choque para calcular a noradrenalina em Infusões e volta encontra o roteiro
 * no mesmo passo, com a linha do tempo — inclusive quando o celular recarrega
 * a aba ao voltar de outro app. Nada sai do aparelho e nada identifica o
 * paciente (só números, ids e o texto digitado nos campos).
 *
 * Formato `{ savedAt, value }` sob `copiloto:ferramentas:sessao:<chave>`, o
 * mesmo das Infusões (CC-311): o peso salvo aqui é o peso que lá aparece.
 */

const PREFIX = 'copiloto:ferramentas:sessao:';

/**
 * Peso: 30 minutos sem uso, como nas Infusões — o plantão segue, o peso do
 * paciente de meia hora atrás não volta sozinho.
 */
export const WEIGHT_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Roteiro: 6 horas sem uso. O ANDROMEDA-SHOCK 2 reavalia o TEC a cada hora
 * por 6 horas; com 30 minutos a linha do tempo se perderia entre duas
 * reavaliações. Para não confundir pacientes, a tela avisa quando retoma um
 * roteiro e oferece recomeçar.
 */
export const ROTEIRO_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

export interface SessionValue<T> {
  value: T;
  /** Última gravação (epoch em ms). */
  savedAt: number;
}

/**
 * Lê sem confiar no formato: vencido, com data no futuro, de outra versão ou
 * editado à mão vira `null`, e a tela começa do zero.
 */
export function readSessionValue<T>(
  key: string,
  parse: (value: unknown) => T | null,
  ttlMs: number,
  now = Date.now(),
): SessionValue<T> | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
  if (!raw) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof stored !== 'object' || stored === null || !('value' in stored)) return null;
  const { savedAt, value } = stored as { savedAt?: unknown; value: unknown };
  if (typeof savedAt !== 'number' || savedAt > now || now - savedAt > ttlMs) return null;
  const parsed = parse(value);
  return parsed === null ? null : { value: parsed, savedAt };
}

export function writeSessionValue(key: string, value: unknown, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, value }));
  } catch {
    /* armazenamento indisponível (aba privada): o estado vale só enquanto a tela está aberta */
  }
}

/**
 * `useReducer` que sobrevive a ir e voltar na mesma aba. `restoredAt` diz
 * quando o estado retomado foi gravado pela última vez (`null` se a tela
 * começou do zero); a tela usa isso para avisar que retomou um roteiro.
 *
 * As páginas de (app) só montam no cliente, depois do login: ler o storage no
 * inicializador é seguro (mesmo padrão dos favoritos).
 */
export function useSessionReducer<S, A>(
  key: string,
  reducer: (state: S, action: A) => S,
  parse: (value: unknown) => S | null,
  initial: S,
  ttlMs: number,
): {
  state: S;
  dispatch: (action: A) => void;
  restoredAt: number | null;
  dismissRestored: () => void;
} {
  const [restored] = useState(() => readSessionValue(key, parse, ttlMs));
  const [state, dispatch] = useReducer(reducer, restored?.value ?? initial);
  const [restoredAt, setRestoredAt] = useState(restored?.savedAt ?? null);

  useEffect(() => {
    writeSessionValue(key, state);
  }, [key, state]);

  const dismissRestored = useCallback(() => setRestoredAt(null), []);
  return { state, dispatch, restoredAt, dismissRestored };
}

function parseWeightText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 20 ? value : null;
}

/**
 * Peso adulto digitado (texto cru, validado por quem usa), comum às
 * ferramentas adultas: o peso do Choque é o das Infusões e vice-versa, como
 * o contexto de peso do ANY. Mesma chave e formato do `useToolWeight` das
 * Infusões (CC-311); no merge os dois viram um só.
 */
export function useSharedAdultWeight(): [string, (raw: string) => void] {
  const [weight, setWeight] = useState(
    () => readSessionValue('peso-adulto', parseWeightText, WEIGHT_SESSION_TTL_MS)?.value ?? '',
  );
  useEffect(() => {
    writeSessionValue('peso-adulto', weight);
  }, [weight]);
  return [weight, setWeight];
}

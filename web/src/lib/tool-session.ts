'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';

/**
 * Estado de tela das Ferramentas na aba (sessionStorage), único para todas
 * elas. Quem sai do Choque para calcular a noradrenalina em Infusões, ou do
 * ACLS para a Via aérea, e volta encontra o roteiro no mesmo passo, com o
 * peso e as respostas como deixou — inclusive quando o celular recarrega a aba
 * ao voltar de outro app (CC-331).
 *
 * Formato `{ savedAt, value }` sob `copiloto:ferramentas:sessao:<chave>`.
 * O ANY começava o peso sempre vazio para não reaproveitar o peso do paciente
 * anterior. Aqui o estado vale só na aba e expira depois de um tempo sem uso
 * (`toolSessionTtl`): o plantão segue, o paciente de meia hora atrás não volta
 * sozinho. Nada sai do aparelho e nada identifica o paciente (só números, ids
 * e o texto digitado nos campos).
 */

const PREFIX = 'copiloto:ferramentas:sessao:';

/** Padrão: 30 minutos sem uso. */
export const TOOL_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Roteiros com reavaliação de hora em hora (Choque, CAD e EHH): 6 horas sem
 * uso. O ANDROMEDA-SHOCK 2 reavalia o TEC a cada hora por 6 horas; com 30
 * minutos a linha do tempo se perderia entre duas reavaliações. Para não
 * confundir pacientes, a tela avisa quando retoma um roteiro e oferece
 * recomeçar.
 */
export const ROTEIRO_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

/** HACOR: o T0 e as reavaliações de 1–2 h precisam sobreviver a sair da tela. */
export const HACOR_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

/** Peso adulto comum às ferramentas, como o contexto de peso do ANY. */
export const ADULT_WEIGHT_KEY = 'peso-adulto';

/** Validade por chave; o que não está aqui vale `TOOL_SESSION_TTL_MS`. */
const TTL_BY_KEY: Readonly<Record<string, number>> = {
  'choque-septico': ROTEIRO_SESSION_TTL_MS,
  'choque-indiferenciado': ROTEIRO_SESSION_TTL_MS,
  'cad-ehh': ROTEIRO_SESSION_TTL_MS,
  'vm-hacor': HACOR_SESSION_TTL_MS,
};

export function toolSessionTtl(key: string): number {
  return TTL_BY_KEY[key] ?? TOOL_SESSION_TTL_MS;
}

export interface ToolSessionEntry<T> {
  value: T;
  /** Última gravação (epoch em ms). */
  savedAt: number;
}

/**
 * Lê sem confiar no formato: vencido, com data no futuro, de outra versão ou
 * editado à mão vira `null`, e a tela começa do zero.
 */
export function readToolSessionEntry<T>(
  key: string,
  parse: (value: unknown) => T | null,
  now = Date.now(),
): ToolSessionEntry<T> | null {
  if (typeof window === 'undefined') return null;
  let stored: unknown;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof stored !== 'object' || stored === null || !('value' in stored)) return null;
  const { savedAt, value } = stored as { savedAt?: unknown; value: unknown };
  if (typeof savedAt !== 'number' || savedAt > now || now - savedAt > toolSessionTtl(key)) {
    return null;
  }
  const parsed = parse(value);
  return parsed === null ? null : { value: parsed, savedAt };
}

export function readToolSession<T>(
  key: string,
  parse: (value: unknown) => T | null,
  now = Date.now(),
): T | null {
  return readToolSessionEntry(key, parse, now)?.value ?? null;
}

export function writeToolSession(key: string, value: unknown, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, value }));
  } catch {
    /* aba privada ou cota cheia: o estado vale só enquanto a tela está aberta */
  }
}

/**
 * `useState` que sobrevive a ir e voltar na mesma aba. As páginas de (app)
 * só montam no cliente, depois do login: ler o storage no inicializador é
 * seguro (mesmo padrão dos favoritos).
 */
export function useToolSession<T>(
  key: string,
  parse: (value: unknown) => T | null,
  initial: () => T,
): [T, (update: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readToolSession(key, parse) ?? initial());

  useEffect(() => {
    writeToolSession(key, value);
  }, [key, value]);

  const update = useCallback((next: T | ((current: T) => T)) => setValue(next), []);
  return [value, update];
}

/**
 * `useReducer` que sobrevive a ir e voltar na mesma aba. `restoredAt` diz
 * quando o estado retomado foi gravado pela última vez (`null` se a tela
 * começou do zero); a tela usa isso para avisar que retomou um roteiro.
 */
export function useToolSessionReducer<S, A>(
  key: string,
  reducer: (state: S, action: A) => S,
  parse: (value: unknown) => S | null,
  initial: S,
): {
  state: S;
  dispatch: (action: A) => void;
  restoredAt: number | null;
  dismissRestored: () => void;
} {
  const [restored] = useState(() => readToolSessionEntry(key, parse));
  const [state, dispatch] = useReducer(reducer, restored?.value ?? initial);
  const [restoredAt, setRestoredAt] = useState(restored?.savedAt ?? null);

  useEffect(() => {
    writeToolSession(key, state);
  }, [key, state]);

  const dismissRestored = useCallback(() => setRestoredAt(null), []);
  return { state, dispatch, restoredAt, dismissRestored };
}

function parseWeightText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 20 ? value : null;
}

/**
 * Peso adulto digitado (texto cru, validado por quem usa: 40–200 kg), comum
 * às ferramentas adultas: o peso informado em Infusões vale no Choque, no TEP,
 * na Via aérea, na Sedação, na Dengue e nos Bloqueios, e vice-versa.
 */
export function useToolWeight(): [
  string,
  (update: string | ((current: string) => string)) => void,
] {
  return useToolSession(ADULT_WEIGHT_KEY, parseWeightText, () => '');
}

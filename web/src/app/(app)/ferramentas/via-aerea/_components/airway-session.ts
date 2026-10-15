'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Estado da via aérea na aba (sessionStorage): quem sai do roteiro para outra
 * ferramenta (ex.: noradrenalina em Infusões) e volta encontra o passo, as
 * respostas e o peso como deixou, inclusive quando o celular recarrega a aba.
 *
 * O ANY começava o peso sempre vazio para não reaproveitar o do paciente
 * anterior. Aqui o estado vale só na aba e vence após `SESSION_TTL_MS` sem
 * uso; "Recomeçar (novo paciente)" limpa tudo. Nada sai do aparelho.
 *
 * Formato `{ savedAt, value }` em `copiloto:ferramentas:sessao:<chave>`, o
 * mesmo das outras ferramentas, e o peso na chave comum às ferramentas
 * adultas (`peso-adulto`), como o contexto de peso do ANY.
 */

export const SESSION_TTL_MS = 30 * 60 * 1000;
const PREFIX = 'copiloto:ferramentas:sessao:';

export const AIRWAY_SESSION_KEY = 'via-aerea';
export const ADULT_WEIGHT_KEY = 'peso-adulto';

interface Stored {
  savedAt: number;
  value: unknown;
}

function isStored(value: unknown): value is Stored {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Stored).savedAt === 'number' &&
    'value' in value
  );
}

/** Lê sem confiar no formato: vencido, de outra versão ou editado à mão vira `null`. */
export function readSession<T>(
  key: string,
  parse: (value: unknown) => T | null,
  now = Date.now(),
): T | null {
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
  if (!isStored(stored) || now - stored.savedAt > SESSION_TTL_MS || stored.savedAt > now) {
    return null;
  }
  return parse(stored.value);
}

export function writeSession(key: string, value: unknown, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, value }));
  } catch {
    /* armazenamento indisponível (aba privada): o estado vale enquanto a tela está aberta */
  }
}

/**
 * `useState` que sobrevive a ir e voltar na mesma aba. As páginas de (app) só
 * montam no cliente, depois do login: ler o storage no inicializador é seguro
 * (mesmo padrão dos favoritos).
 */
export function useSessionState<T>(
  key: string,
  parse: (value: unknown) => T | null,
  initial: () => T,
): [T, (update: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readSession(key, parse) ?? initial());

  useEffect(() => {
    writeSession(key, value);
  }, [key, value]);

  const update = useCallback((next: T | ((current: T) => T)) => setValue(next), []);
  return [value, update];
}

function parseWeightText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 20 ? value : null;
}

/** Peso digitado (texto cru, validado pelo motor), comum às ferramentas adultas. */
export function useAdultWeight(): [string, (raw: string) => void] {
  return useSessionState(ADULT_WEIGHT_KEY, parseWeightText, () => '');
}

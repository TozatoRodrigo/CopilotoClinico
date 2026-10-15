'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Estado da dengue na aba (sessionStorage): quem sai do roteiro para outra
 * ferramenta e volta encontra a tela, os sinais marcados e o peso como
 * deixou, inclusive quando o celular recarrega a aba ao voltar do WhatsApp.
 *
 * O ANY começava o peso sempre vazio para não reaproveitar o do paciente
 * anterior. Aqui o estado vale só na aba e vence depois de `SESSION_TTL_MS`
 * sem uso; "Novo paciente" limpa tudo. Nada sai do aparelho.
 *
 * Formato `{ savedAt, value }` em `copiloto:ferramentas:sessao:<chave>`, o
 * mesmo das outras ferramentas, e o peso na chave comum às ferramentas
 * adultas (`peso-adulto`, texto cru), como o contexto de peso do ANY: o peso
 * digitado em Infusões ou na Via aérea vale aqui, e vice-versa.
 */

export const SESSION_TTL_MS = 30 * 60 * 1000;
const PREFIX = 'copiloto:ferramentas:sessao:';

export const DENGUE_SESSION_KEY = 'dengue';
export const ADULT_WEIGHT_KEY = 'peso-adulto';

interface Stored {
  savedAt: number;
  value: unknown;
}

function isStored(value: unknown): value is Stored {
  if (typeof value !== 'object' || value === null || !('value' in value)) return false;
  return typeof (value as { savedAt?: unknown }).savedAt === 'number';
}

/** Lê sem confiar no formato: vencido, do futuro, de outra versão ou corrompido vira `null`. */
export function readSessionValue<T>(
  key: string,
  parse: (value: unknown) => T | null,
  now = Date.now(),
): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!isStored(stored) || stored.savedAt > now || now - stored.savedAt > SESSION_TTL_MS) {
      return null;
    }
    return parse(stored.value);
  } catch {
    return null;
  }
}

export function writeSessionValue(key: string, value: unknown, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, value }));
  } catch {
    /* aba privada ou cota cheia: o estado vale enquanto a tela está aberta */
  }
}

/**
 * `useState` que sobrevive a sair e voltar na mesma aba. As páginas de (app)
 * só montam no cliente, depois do login, então ler o storage no
 * inicializador é seguro (mesmo padrão dos favoritos).
 */
export function useSessionValue<T>(
  key: string,
  parse: (value: unknown) => T | null,
  initial: () => T,
): [T, (update: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readSessionValue(key, parse) ?? initial());

  useEffect(() => {
    writeSessionValue(key, value);
  }, [key, value]);

  const update = useCallback((next: T | ((current: T) => T)) => setValue(next), []);
  return [value, update];
}

function parseWeightText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 20 ? value : null;
}

/** Peso adulto digitado (texto cru; o motor valida a faixa de 40 a 200 kg). */
export function useAdultWeight(): [string, (raw: string) => void] {
  return useSessionValue(ADULT_WEIGHT_KEY, parseWeightText, () => '');
}

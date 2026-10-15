'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * O que os bloqueios guardam na aba (sessionStorage): o peso e o rascunho da
 * nota de evolução. Quem confere a dose máxima no meio da nota e volta
 * encontra tudo como deixou, inclusive quando o celular recarrega a aba.
 *
 * No ANY o BlockPath tinha um peso próprio em cada tela, começando em 70 kg.
 * Aqui o peso é o adulto comum às ferramentas: mesma chave
 * (`copiloto:ferramentas:sessao:peso-adulto`), mesmo formato (`{ savedAt,
 * value }`, texto cru do campo) e mesma validade de 30 minutos das outras,
 * para o paciente de meia hora atrás não voltar sozinho. Nada sai do aparelho.
 */

const PREFIX = 'copiloto:ferramentas:sessao:';
export const SESSION_TTL_MS = 30 * 60 * 1000;
export const ADULT_WEIGHT_KEY = 'peso-adulto';

interface Envelope {
  savedAt: number;
  value: unknown;
}

function isEnvelope(stored: unknown): stored is Envelope {
  if (typeof stored !== 'object' || stored === null) return false;
  return typeof (stored as { savedAt?: unknown }).savedAt === 'number' && 'value' in stored;
}

/** Lê sem confiar no que está lá: vencido, do futuro, ilegível ou de outro formato vira `null`. */
export function readSessionValue<T>(
  key: string,
  parse: (value: unknown) => T | null,
  now = Date.now(),
): T | null {
  if (typeof window === 'undefined') return null;
  let stored: unknown;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isEnvelope(stored)) return null;
  const age = now - stored.savedAt;
  if (age < 0 || age > SESSION_TTL_MS) return null;
  return parse(stored.value);
}

export function writeSessionValue(key: string, value: unknown, now = Date.now()): void {
  try {
    const envelope: Envelope = { savedAt: now, value };
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    /* aba privada ou cota cheia: o valor vale enquanto a tela está aberta */
  }
}

/**
 * `useState` que sobrevive a sair e voltar na mesma aba. As páginas de (app)
 * só montam no cliente, depois do login, então ler o storage no
 * inicializador é seguro (como os favoritos).
 */
export function useSessionValue<T>(
  key: string,
  parse: (value: unknown) => T | null,
  fallback: () => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readSessionValue(key, parse) ?? fallback());
  useEffect(() => {
    writeSessionValue(key, value);
  }, [key, value]);
  return [value, setValue];
}

/** Texto cru do campo de peso; quem calcula valida a faixa (40–200 kg). */
function parseWeightText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 20 ? value : null;
}

export function useAdultWeight(): [string, Dispatch<SetStateAction<string>>] {
  return useSessionValue(ADULT_WEIGHT_KEY, parseWeightText, () => '');
}

'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Estado de tela das Ferramentas na aba (sessionStorage). Quem sai de
 * Infusões para o Choque e volta encontra o peso, a droga e a dose como
 * deixou — inclusive quando o celular recarrega a aba ao voltar de outro app.
 *
 * O ANY começava o peso sempre vazio para não reaproveitar o peso do paciente
 * anterior. Aqui o estado vale só na aba e expira depois de
 * `TOOL_SESSION_TTL_MS` sem uso: o plantão segue, o paciente de meia hora atrás
 * não volta sozinho. Nada disso sai do aparelho.
 */

export const TOOL_SESSION_TTL_MS = 30 * 60 * 1000;
const PREFIX = 'copiloto:ferramentas:sessao:';

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

/**
 * Lê o estado salvo sem confiar no formato: vencido, de outra versão ou
 * editado à mão vira `null`, e a tela começa do zero.
 */
export function readToolSession<T>(
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
  if (!isStored(stored) || now - stored.savedAt > TOOL_SESSION_TTL_MS || stored.savedAt > now) {
    return null;
  }
  return parse(stored.value);
}

export function writeToolSession(key: string, value: unknown, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, value }));
  } catch {
    /* armazenamento indisponível (aba privada): o estado vale só enquanto a tela está aberta */
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

function parseText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 20 ? value : null;
}

/**
 * Peso digitado (texto cru, validado por quem usa), comum às ferramentas
 * adultas: o peso informado em Infusões vale no Choque e no TEP, como no
 * contexto de peso do ANY.
 */
export function useToolWeight(): [string, (raw: string) => void] {
  return useToolSession('peso-adulto', parseText, () => '');
}

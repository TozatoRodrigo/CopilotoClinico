'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HacorEntry, HacorPhase } from '@clinical-tools/ventilation/hacor';

/**
 * Estado do HACOR na aba (sessionStorage): o T0 e as reavaliações precisam
 * sobreviver a sair da tela por 1–2 h e voltar. No ANY ficava só na memória
 * da página e se perdia ao navegar.
 *
 * Vale só na aba e expira depois de `HACOR_SESSION_TTL_MS` sem uso, para o
 * histórico de um paciente não aparecer no próximo. Nada sai do aparelho e
 * não há dado de identificação: só respostas e scores.
 *
 * Mínimo local de propósito: ao juntar com o `tool-session` das outras
 * ferramentas (CC-311/CC-318), este passa a usar aquele, que precisa aceitar
 * um prazo por chave (lá são 30 min; a reavaliação do HACOR vai a 2 h).
 */

export const HACOR_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const HACOR_SESSION_KEY = 'copiloto:ferramentas:sessao:vm-hacor';

export interface HacorSession {
  /** `null` enquanto o médico não escolheu iniciar ou reavaliar. */
  phase: HacorPhase | null;
  /** Respostas da avaliação inicial e da reavaliação: id do item → id da opção. */
  start: Record<string, string>;
  reassessment: Record<string, string>;
  history: HacorEntry[];
}

export const EMPTY_HACOR_SESSION: HacorSession = {
  phase: null,
  start: {},
  reassessment: {},
  history: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAnswers(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, option]) => typeof option === 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseEntry(value: unknown): HacorEntry | null {
  if (!isRecord(value)) return null;
  const { label, time, score } = value;
  if (typeof label !== 'string' || typeof time !== 'string' || typeof score !== 'number') {
    return null;
  }
  return { label, time, score };
}

/** Lê sem confiar no formato: versão antiga ou edição à mão vira `null` e a tela recomeça. */
export function parseHacorSession(value: unknown): HacorSession | null {
  if (!isRecord(value)) return null;
  const phase = value.phase;
  if (phase !== null && phase !== 'inicio' && phase !== 'reavaliacao') return null;
  const start = parseAnswers(value.start);
  const reassessment = parseAnswers(value.reassessment);
  if (!start || !reassessment || !Array.isArray(value.history)) return null;
  const history = value.history.map(parseEntry);
  if (history.some((entry) => entry === null)) return null;
  return { phase, start, reassessment, history: history as HacorEntry[] };
}

export function readHacorSession(now = Date.now()): HacorSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HACOR_SESSION_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || typeof stored.savedAt !== 'number') return null;
    if (now - stored.savedAt > HACOR_SESSION_TTL_MS || stored.savedAt > now) return null;
    return parseHacorSession(stored.value);
  } catch {
    return null;
  }
}

function writeHacorSession(value: HacorSession, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(HACOR_SESSION_KEY, JSON.stringify({ savedAt: now, value }));
  } catch {
    /* armazenamento indisponível (aba privada): vale enquanto a tela estiver aberta */
  }
}

/**
 * Estado do HACOR que sobrevive a ir e voltar na mesma aba. As páginas de
 * (app) só montam no cliente, depois do login: ler o storage no
 * inicializador é seguro (mesmo padrão dos favoritos).
 */
export function useHacorSession(): [
  HacorSession,
  (update: (current: HacorSession) => HacorSession) => void,
] {
  const [session, setSession] = useState<HacorSession>(
    () => readHacorSession() ?? EMPTY_HACOR_SESSION,
  );

  useEffect(() => {
    writeHacorSession(session);
  }, [session]);

  const update = useCallback(
    (next: (current: HacorSession) => HacorSession) => setSession(next),
    [],
  );
  return [session, update];
}

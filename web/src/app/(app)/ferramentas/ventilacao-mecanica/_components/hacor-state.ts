'use client';

import type { HacorEntry, HacorPhase } from '@clinical-tools/ventilation/hacor';
import { readToolSession, useToolSession } from '@/lib/tool-session';

/**
 * Estado do HACOR na aba (tool-session.ts): o T0 e as reavaliações precisam
 * sobreviver a sair da tela por 1–2 h e voltar, por isso a chave `vm-hacor`
 * vale 4 h (as outras ferramentas, 30 min). No ANY ficava só na memória da
 * página e se perdia ao navegar. Nada sai do aparelho e não há dado de
 * identificação: só respostas e scores.
 */

export const HACOR_SESSION_KEY = 'vm-hacor';

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
  return readToolSession(HACOR_SESSION_KEY, parseHacorSession, now);
}

/** Estado do HACOR que sobrevive a ir e voltar na mesma aba. */
export function useHacorSession(): [
  HacorSession,
  (update: (current: HacorSession) => HacorSession) => void,
] {
  return useToolSession(HACOR_SESSION_KEY, parseHacorSession, () => EMPTY_HACOR_SESSION);
}

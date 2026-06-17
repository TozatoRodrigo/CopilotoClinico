/**
 * i18n-ready message registry.
 *
 * Usage:
 *   import { messages } from '@/lib/messages';
 *   <h1>{messages.copilot.result.title}</h1>
 *   <span>{messages.copilot.result.recommendationsCount(3)}</span>
 *
 * To add a locale: create `en-US.ts` exporting the same `Messages` shape, add it
 * to `dictionaries`, and resolve the locale (e.g. from next/headers or a cookie).
 * All copy stays external to components, so swapping locales needs no UI changes.
 */

import { ptBR, type Messages } from './pt-BR';

export type { Messages };
export type Locale = 'pt-BR';

export const DEFAULT_LOCALE: Locale = 'pt-BR';

const dictionaries: Record<Locale, Messages> = {
  'pt-BR': ptBR,
};

/** Resolved messages for a locale (falls back to pt-BR). */
export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return dictionaries[locale] ?? ptBR;
}

/** Default-locale messages — the common case for the current pt-BR product. */
export const messages: Messages = getMessages(DEFAULT_LOCALE);

/**
 * Substrings the clinical copilot must never attribute to itself. The copilot
 * only *suggests / indicates / recommends* — never *diagnoses / guarantees /
 * cures*. Guarded by messages.guard.test.ts against the whole dictionary.
 *
 * Word-boundary regexes avoid false positives (e.g. "curativo", "Diagnóstico").
 */
export const FORBIDDEN_AI_PATTERNS: RegExp[] = [
  /\bdiagnosticar\b/i,
  /\bdiagnostica\b/i,
  /\bgarant(e|ir)\b/i,
  /\bassegur(a|ar)\b/i,
  /\bcomprov(a|adamente)\b/i,
  /\bcurar\b/i,
  /\bcura\b/i,
  /\bcerteza\b/i,
  /100\s?%\s*(de\s+)?(certeza|acerto|precis[aã]o)/i,
];

/** True if a string uses a forbidden "AI makes the decision" term. */
export function hasForbiddenTerm(value: string): boolean {
  return FORBIDDEN_AI_PATTERNS.some((pattern) => pattern.test(value));
}

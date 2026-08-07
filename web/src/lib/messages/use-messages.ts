"use client";

import { useAuthOptional } from "@/lib/auth-store";
import { getMessages, DEFAULT_LOCALE, type Locale, type Messages } from "./index";

const SUPPORTED_LOCALES: readonly Locale[] = ["pt-BR", "es"];

function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * PI-05 — resolve o dicionário de UI no locale salvo na CONTA do médico
 * (`physician.locale`, persistido no backend — não apenas no localStorage do
 * dispositivo, para o médico levar a preferência ao trocar de terminal no
 * hospital). Cai para pt-BR quando:
 * - não há médico autenticado (páginas públicas, error boundaries fora do
 *   AuthProvider — ver useAuthOptional);
 * - o valor salvo não é um dos locales com dicionário embarcado (defesa
 *   contra dado legado/corrompido, nunca deixa a UI sem texto).
 *
 * Componentes que hoje importam `messages` estaticamente devem trocar para
 * `const messages = useMessages();` para respeitar a preferência do médico.
 */
export function useMessages(): Messages {
  const auth = useAuthOptional();
  const locale = isSupportedLocale(auth?.physician?.locale)
    ? (auth!.physician!.locale as Locale)
    : DEFAULT_LOCALE;
  return getMessages(locale);
}

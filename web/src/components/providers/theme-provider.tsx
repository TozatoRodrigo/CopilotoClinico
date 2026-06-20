"use client";

/**
 * ThemeProvider — wrapper para next-themes que só monta no client.
 *
 * next-themes v0.4.6 renderiza um <script> via JSX durante SSR para prevenir
 * FOUC (flash de tema). React 19 no Next.js 16 rejeita scripts em componentes
 * ("Encountered a script tag while rendering React component").
 *
 * Solução: usar `next/dynamic` com `ssr: false` para carregar o ThemeProvider
 * apenas no client. O tema inicial é aplicado por um <script> inline crú no
 * <head> do layout (HTML puro, não React), que executa antes da hidratação.
 */
import dynamic from "next/dynamic";

const NextThemesProvider = dynamic(
  () => import("next-themes").then((m) => m.ThemeProvider),
  {
    ssr: false,
    // Placeholder vazio durante o carregamento inicial (1 frame).
    loading: () => null,
  },
);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

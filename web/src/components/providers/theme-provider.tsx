"use client";

/**
 * ThemeProvider — provider de tema sem next-themes.
 *
 * next-themes v0.4.6 renderiza um <script> via JSX que o React 19 / Next.js 16
 * rejeita ("Encountered a script tag while rendering React component").
 *
 * Esta implementação mantém a mesma API ({ theme, setTheme, resolvedTheme })
 * sem injetar scripts. O FOUC é tratado pelo <script> inline cru no <head>
 * do layout (HTML puro, não React).
 *
 * O tema escolhido mora no localStorage e a preferência do sistema no
 * matchMedia; o React lê os dois por useSyncExternalStore. No servidor e na
 * hidratação o tema é "system" e o resolvido fica indefinido; logo depois o
 * client troca pelo valor real, sem mismatch e sem setState dentro de efeito.
 */
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme | undefined;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const themeListeners = new Set<() => void>();

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function subscribeTheme(onChange: () => void): () => void {
  themeListeners.add(onChange);
  return () => themeListeners.delete(onChange);
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : "system";
}

function serverTheme(): Theme {
  return "system";
}

function setTheme(next: Theme): void {
  localStorage.setItem(STORAGE_KEY, next);
  themeListeners.forEach((listener) => listener());
}

function subscribeSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function serverSystemTheme(): ResolvedTheme | undefined {
  return undefined;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readStoredTheme, serverTheme);
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    readSystemTheme,
    serverSystemTheme,
  );
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (resolvedTheme) applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: undefined, resolvedTheme: undefined, setTheme: () => {} };
  }
  return ctx;
}

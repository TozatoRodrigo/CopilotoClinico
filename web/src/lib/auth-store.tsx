"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { Physician, PhysicianRole } from "@/lib/types";

export type AppRole = "physician" | "compliance" | "admin";

const ROLE_MAP: Record<PhysicianRole, AppRole> = {
  PHYSICIAN: "physician",
  COMPLIANCE: "compliance",
  ADMIN: "admin",
};

function toAppRole(role?: PhysicianRole): AppRole {
  return role ? (ROLE_MAP[role] ?? "physician") : "physician";
}

interface AuthState {
  physician: Physician | null;
  isAuthenticated: boolean;
  role: AppRole;
  /**
   * True enquanto o estado inicial está sendo carregado do localStorage.
   * Evita redirect prematuro para /login antes de saber se o usuário tem sessão.
   */
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (physician: Physician) => void;
  logout: () => void;
  /**
   * S24-ONBOARD-01 — Atualiza dados parciais do médico em memória e
   * persistência (localStorage). Usado após PATCH /auth/me para refletir
   * imediatamente nome/especialidade sem precisar reload.
   */
  updatePhysician: (partial: Partial<Physician>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PHYSICIAN_KEY = "auth_physician";
const DEFAULT_ROLE: AppRole = "physician";

function syncCookie(physician: Physician | null) {
  if (typeof document === "undefined") return;
  if (physician) {
    document.cookie = `${PHYSICIAN_KEY}=${encodeURIComponent(JSON.stringify(physician))}; path=/; max-age=604800; samesite=strict`;
  } else {
    document.cookie = `${PHYSICIAN_KEY}=; path=/; max-age=0`;
  }
}

const LOADING: AuthState = {
  physician: null,
  isAuthenticated: false,
  role: DEFAULT_ROLE,
  isLoading: true, // servidor e hidratação: ainda não leu o localStorage
};

const SIGNED_OUT: AuthState = { ...LOADING, isLoading: false };

// O médico logado mora no localStorage (e no cookie que o middleware lê); o
// React lê por useSyncExternalStore. No servidor e na hidratação o snapshot é
// LOADING, e o client troca pelo valor guardado logo depois — sem mismatch e
// sem setState dentro de efeito. O cache por string mantém a mesma referência
// enquanto o localStorage não muda, como o useSyncExternalStore exige.
const authListeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedState: AuthState = SIGNED_OUT;

function parseStoredPhysician(raw: string | null): AuthState {
  if (!raw) return SIGNED_OUT;
  try {
    const physician = JSON.parse(raw) as Physician;
    return {
      physician,
      isAuthenticated: true,
      role: toAppRole(physician.role),
      isLoading: false,
    };
  } catch {
    // JSON corrompido conta como sem sessão; o próximo login sobrescreve.
    return SIGNED_OUT;
  }
}

function readAuthState(): AuthState {
  const raw = localStorage.getItem(PHYSICIAN_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseStoredPhysician(raw);
  }
  return cachedState;
}

function readServerAuthState(): AuthState {
  return LOADING;
}

function subscribeAuth(onChange: () => void): () => void {
  authListeners.add(onChange);
  return () => authListeners.delete(onChange);
}

function writePhysician(physician: Physician | null): void {
  if (physician) {
    localStorage.setItem(PHYSICIAN_KEY, JSON.stringify(physician));
  } else {
    localStorage.removeItem(PHYSICIAN_KEY);
  }
  syncCookie(physician);
  authListeners.forEach((listener) => listener());
}

function login(physician: Physician): void {
  writePhysician(physician);
}

function logout(): void {
  writePhysician(null);
}

// S24-ONBOARD-01 — merge partial em physician atual.
function updatePhysician(partial: Partial<Physician>): void {
  const current = readAuthState().physician;
  if (!current) return;
  writePhysician({ ...current, ...partial });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeAuth, readAuthState, readServerAuthState);

  // Depois da hidratação, o cookie acompanha o localStorage: o middleware só
  // enxerga o cookie, que expira (max-age) antes do localStorage.
  useEffect(() => {
    if (!state.isLoading) syncCookie(state.physician);
  }, [state.isLoading, state.physician]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updatePhysician }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * PI-05 — variante que NÃO lança fora de um AuthProvider (retorna null).
 * Usada por `useMessages()` para resolver o locale do médico sem quebrar
 * superfícies que podem renderizar fora da árvore de providers, como
 * `app/global-error.tsx` (substitui o root layout inteiro quando ele
 * próprio falha).
 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}

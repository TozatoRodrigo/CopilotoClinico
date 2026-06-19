"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
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

function getStoredState(): AuthState {
  if (typeof window === "undefined") {
    return { physician: null, isAuthenticated: false, role: DEFAULT_ROLE };
  }
  const physicianRaw = localStorage.getItem(PHYSICIAN_KEY);
    if (physicianRaw) {
    try {
      const physician = JSON.parse(physicianRaw) as Physician;
      return {
        physician,
        isAuthenticated: true,
        role: toAppRole(physician.role),
      };
    } catch {
      localStorage.removeItem(PHYSICIAN_KEY);
    }
  }
  return { physician: null, isAuthenticated: false, role: DEFAULT_ROLE };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(getStoredState);

  useEffect(() => {
    syncCookie(state.physician);
  }, [state.physician]);

  const login = useCallback((physician: Physician) => {
    localStorage.setItem(PHYSICIAN_KEY, JSON.stringify(physician));
    syncCookie(physician);
    setState({
      physician,
      isAuthenticated: true,
      role: toAppRole(physician.role),
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(PHYSICIAN_KEY);
    syncCookie(null);
    setState({ physician: null, isAuthenticated: false, role: DEFAULT_ROLE });
  }, []);

  // S24-ONBOARD-01 — merge partial em physician atual; mantém role autal.
  const updatePhysician = useCallback((partial: Partial<Physician>) => {
    setState((prev) => {
      if (!prev.physician) return prev;
      const next = { ...prev.physician, ...partial };
      localStorage.setItem(PHYSICIAN_KEY, JSON.stringify(next));
      syncCookie(next);
      return { ...prev, physician: next };
    });
  }, []);

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

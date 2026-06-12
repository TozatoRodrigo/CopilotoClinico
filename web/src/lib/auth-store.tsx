"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { Physician } from "@/lib/types";

export type AppRole = "physician" | "compliance" | "admin";

interface AuthState {
  physician: Physician | null;
  isAuthenticated: boolean;
  role: AppRole;
}

interface AuthContextValue extends AuthState {
  login: (physician: Physician) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PHYSICIAN_KEY = "auth_physician";
const DEFAULT_ROLE: AppRole = "physician";
type StoredPhysician = Physician & { role?: AppRole };

function getStoredState(): AuthState {
  if (typeof window === "undefined") {
    return { physician: null, isAuthenticated: false, role: DEFAULT_ROLE };
  }
  const physicianRaw = localStorage.getItem(PHYSICIAN_KEY);
  if (physicianRaw) {
    try {
      const physician = JSON.parse(physicianRaw) as StoredPhysician;
      return {
        physician,
        isAuthenticated: true,
        role: physician.role ?? DEFAULT_ROLE,
      };
    } catch {
      localStorage.removeItem(PHYSICIAN_KEY);
    }
  }
  return { physician: null, isAuthenticated: false, role: DEFAULT_ROLE };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(getStoredState);

  const login = useCallback((physician: Physician) => {
    localStorage.setItem(PHYSICIAN_KEY, JSON.stringify(physician));
    const storedPhysician = physician as StoredPhysician;
    setState({
      physician,
      isAuthenticated: true,
      role: storedPhysician.role ?? DEFAULT_ROLE,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(PHYSICIAN_KEY);
    setState({ physician: null, isAuthenticated: false, role: DEFAULT_ROLE });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
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

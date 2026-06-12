"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { Physician } from "@/lib/types";

interface AuthState {
  physician: Physician | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (physician: Physician) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PHYSICIAN_KEY = "auth_physician";

function getStoredState(): AuthState {
  if (typeof window === "undefined") {
    return { physician: null, isAuthenticated: false };
  }
  const physicianRaw = localStorage.getItem(PHYSICIAN_KEY);
  if (physicianRaw) {
    try {
      const physician = JSON.parse(physicianRaw) as Physician;
      return { physician, isAuthenticated: true };
    } catch {
      localStorage.removeItem(PHYSICIAN_KEY);
    }
  }
  return { physician: null, isAuthenticated: false };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(getStoredState);

  const login = useCallback((physician: Physician) => {
    localStorage.setItem(PHYSICIAN_KEY, JSON.stringify(physician));
    setState({ physician, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(PHYSICIAN_KEY);
    setState({ physician: null, isAuthenticated: false });
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

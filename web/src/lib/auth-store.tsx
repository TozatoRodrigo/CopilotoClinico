"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface Physician {
  id: string;
  name: string | null;
  email: string;
  crmUf: string;
  crmNumber: string;
}

interface AuthState {
  token: string | null;
  physician: Physician | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, physician: Physician) => void;
  logout: () => void;
  refreshToken: (newToken: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "auth_token";
const PHYSICIAN_KEY = "auth_physician";

function getStoredState(): AuthState {
  if (typeof window === "undefined") {
    return { token: null, physician: null, isAuthenticated: false };
  }
  const token = localStorage.getItem(TOKEN_KEY);
  const physicianRaw = localStorage.getItem(PHYSICIAN_KEY);
  if (token && physicianRaw) {
    try {
      const physician = JSON.parse(physicianRaw) as Physician;
      return { token, physician, isAuthenticated: true };
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PHYSICIAN_KEY);
    }
  }
  return { token: null, physician: null, isAuthenticated: false };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(getStoredState);

  if (typeof window !== "undefined" && state.token === null && localStorage.getItem(TOKEN_KEY)) {
    queueMicrotask(() => setState(getStoredState()));
  }

  const login = useCallback((token: string, physician: Physician) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PHYSICIAN_KEY, JSON.stringify(physician));
    setState({ token, physician, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PHYSICIAN_KEY);
    setState({ token: null, physician: null, isAuthenticated: false });
  }, []);

  const refreshToken = useCallback((newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setState((prev) => ({ ...prev, token: newToken }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshToken }}>
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

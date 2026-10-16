import { describe, it, expect, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth-store";
import type { Physician } from "@/lib/types";

const PHYSICIAN: Physician = {
  id: "phys-1",
  name: "Dra. Ana",
  email: "ana@example.test",
  crmUf: "SP",
  crmNumber: "123456",
  crmVerified: true,
  role: "COMPLIANCE",
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function physicianCookie(): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("auth_physician="))
    ?.slice("auth_physician=".length);
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "auth_physician=; path=/; max-age=0";
  });

  it("restaura a sessão guardada no localStorage e reescreve o cookie", () => {
    localStorage.setItem("auth_physician", JSON.stringify(PHYSICIAN));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toMatchObject({
      physician: PHYSICIAN,
      isAuthenticated: true,
      role: "compliance",
      isLoading: false,
    });
    expect(JSON.parse(decodeURIComponent(physicianCookie() ?? ""))).toEqual(PHYSICIAN);
  });

  it("sem sessão guardada termina de carregar como deslogado", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toMatchObject({
      physician: null,
      isAuthenticated: false,
      role: "physician",
      isLoading: false,
    });
  });

  it("JSON corrompido no localStorage conta como deslogado", () => {
    localStorage.setItem("auth_physician", "{não é json");

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("login, updatePhysician e logout atualizam estado, localStorage e cookie", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => result.current.login(PHYSICIAN));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.role).toBe("compliance");
    expect(JSON.parse(localStorage.getItem("auth_physician") ?? "null")).toEqual(PHYSICIAN);
    expect(physicianCookie()).toBeTruthy();

    act(() => result.current.updatePhysician({ name: "Dra. Ana Souza" }));
    expect(result.current.physician?.name).toBe("Dra. Ana Souza");
    expect(JSON.parse(localStorage.getItem("auth_physician") ?? "null")).toMatchObject({
      name: "Dra. Ana Souza",
    });

    act(() => result.current.logout());
    expect(result.current).toMatchObject({ physician: null, isAuthenticated: false });
    expect(localStorage.getItem("auth_physician")).toBeNull();
    expect(physicianCookie()).toBeFalsy();
  });

  it("updatePhysician sem sessão não cria uma", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => result.current.updatePhysician({ name: "Ninguém" }));

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("auth_physician")).toBeNull();
  });
});

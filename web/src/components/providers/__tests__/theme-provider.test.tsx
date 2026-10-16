import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../theme-provider";

let systemPrefersDark = false;
let systemListener: (() => void) | null = null;

function mockMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: systemPrefersDark,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      systemListener = listener;
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    systemPrefersDark = false;
    systemListener = null;
    mockMatchMedia();
  });

  it("aplica o tema guardado no localStorage", () => {
    localStorage.setItem("theme", "dark");

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("sem escolha (ou valor inválido) segue o sistema", () => {
    localStorage.setItem("theme", "sépia");
    systemPrefersDark = true;

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("setTheme persiste a escolha e troca a classe do <html>", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolvedTheme).toBe("light");

    act(() => result.current.setTheme("dark"));

    expect(localStorage.getItem("theme")).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    act(() => result.current.setTheme("light"));

    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("em 'system', acompanha a mudança de preferência do sistema", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolvedTheme).toBe("light");

    systemPrefersDark = true;
    act(() => systemListener?.());

    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});

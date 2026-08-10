import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: "light" }),
}));

vi.mock("@/lib/auth-store", () => ({
  useAuth: () => ({
    physician: { name: "Dr. Test", email: "dr@test.com" },
    logout: vi.fn(),
    role: "physician",
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: { post: vi.fn(), get: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/components/providers/offline-provider", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

// UX — sidebar contadores (Fase 3) chamam useDashboardStats/useEncounterList
// via react-query, então o AppShell agora precisa de um QueryClientProvider
// no render de teste — sem isso `useQuery` lança "No QueryClient set".
function renderShell(children: ReactNode = "content") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppShell>{children}</AppShell>
    </QueryClientProvider>,
  );
}

describe("AppShell navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the physician shell links and quick actions", () => {
    renderShell();

    const navLinks = screen.getAllByRole("link");
    const hrefs = navLinks.map((l) => l.getAttribute("href")).filter(Boolean);

    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/encounters");
    expect(hrefs).toContain("/guidelines");
    expect(screen.getByText("Ações rápidas")).toBeInTheDocument();
  });

  it("removes audit from the physician shell and exposes profile/settings", async () => {
    renderShell();

    const navLinks = screen.getAllByRole("link");
    const hrefs = navLinks.map((l) => l.getAttribute("href")).filter(Boolean);

    expect(hrefs).not.toContain("/audit");

    fireEvent.pointerDown(screen.getByRole("button", { name: /abrir menu do usuário/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText("Perfil")).toBeInTheDocument();
    expect(await screen.findByText("Configurações")).toBeInTheDocument();
  });
});

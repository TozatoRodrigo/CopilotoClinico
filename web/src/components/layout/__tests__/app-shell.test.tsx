import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

// O OfflineQueueBadge lê a fila na IndexedDB, que o jsdom não tem.
vi.mock("@/hooks/use-offline-queue", () => ({
  useOfflineQueue: () => ({
    items: [],
    count: 0,
    isSyncing: false,
    lastSyncResult: null,
    refresh: vi.fn(),
    removeItem: vi.fn(),
    syncNow: vi.fn(),
  }),
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

    // RD-E1 trocou o botão rotulado por um ícone; o nome acessível mantém o
    // atalho e o título "Ações rápidas" só aparece com o dialog aberto.
    fireEvent.click(screen.getByRole("button", { name: /ações rápidas/i }));
    expect(screen.getByRole("dialog", { name: "Ações rápidas" })).toBeInTheDocument();
  });

  it("removes audit from the physician shell and exposes profile/settings", async () => {
    renderShell();

    const navLinks = screen.getAllByRole("link");
    const hrefs = navLinks.map((l) => l.getAttribute("href")).filter(Boolean);

    expect(hrefs).not.toContain("/audit");

    // O UserMenu é renderizado no header mobile (md:hidden) e nos controles
    // desktop (hidden md:flex). No browser só um fica na árvore acessível; o
    // jsdom não aplica o CSS, então a query é restrita ao header mobile.
    const mobileHeader = screen.getByRole("banner");
    fireEvent.pointerDown(within(mobileHeader).getByRole("button", { name: /abrir menu do usuário/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText("Perfil")).toBeInTheDocument();
    expect(await screen.findByText("Configurações")).toBeInTheDocument();
  });
});

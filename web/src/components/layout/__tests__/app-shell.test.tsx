import type { ReactNode } from "react";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../app-shell";

const pathname = vi.hoisted(() => ({ current: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
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

describe("AppShell — Ferramentas (ADR-017)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    pathname.current = "/dashboard";
  });

  function bottomBar() {
    return within(screen.getByRole("navigation", { name: "Navegação inferior" }));
  }

  it("com a flag desligada, a barra inferior continua com Buscar e não há Ferramentas", () => {
    renderShell();

    expect(bottomBar().getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    expect(bottomBar().queryByRole("link", { name: /Ferramentas/ })).not.toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/ferramentas");
  });

  it("com a flag ligada, Ferramentas entra no lugar de Buscar e a busca sobe para o topo", () => {
    vi.stubEnv("NEXT_PUBLIC_FERRAMENTAS", "on");
    renderShell();

    const tabs = bottomBar().getAllByRole("link").map((link) => link.textContent);
    expect(tabs).toEqual(["Plantão", "Casos", "", "Diretrizes", "Ferramentas"]);
    expect(bottomBar().queryByRole("button", { name: "Buscar" })).not.toBeInTheDocument();
    const header = within(screen.getByRole("banner"));
    expect(header.getAllByRole("button", { name: "Buscar" }).length).toBeGreaterThan(0);

    // Sidebar também ganha o item.
    const sidebar = within(screen.getByRole("complementary", { name: "Barra lateral" }));
    expect(sidebar.getByRole("link", { name: /Ferramentas/ })).toHaveAttribute(
      "href",
      "/ferramentas",
    );
  });

  it("marca Ferramentas como página atual dentro da área", () => {
    vi.stubEnv("NEXT_PUBLIC_FERRAMENTAS", "on");
    pathname.current = "/ferramentas/calculadoras/qsofa";
    renderShell();

    expect(bottomBar().getByRole("link", { name: "Ferramentas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Calculadoras" })).toHaveAttribute(
      "href",
      "/ferramentas/calculadoras",
    );
    expect(screen.getAllByText("qSOFA").length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  apiClient: { post: vi.fn() },
}));

vi.mock("@/components/providers/offline-provider", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

describe("AppShell navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the physician shell links and quick actions", () => {
    render(<AppShell>content</AppShell>);

    const navLinks = screen.getAllByRole("link");
    const hrefs = navLinks.map((l) => l.getAttribute("href")).filter(Boolean);

    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/encounters");
    expect(hrefs).toContain("/guidelines");
    expect(screen.getByText("Ações rápidas")).toBeInTheDocument();
  });

  it("removes audit from the physician shell and exposes profile/settings", async () => {
    render(<AppShell>content</AppShell>);

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

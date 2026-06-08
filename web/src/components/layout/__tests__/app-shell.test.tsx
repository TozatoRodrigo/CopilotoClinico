import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "../app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: "light" }),
}));

vi.mock("@/lib/auth-store", () => ({
  useAuth: () => ({ physician: { name: "Dr. Test", email: "dr@test.com" }, logout: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: { post: vi.fn() },
}));

describe("AppShell navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only existing routes — no ghost links", () => {
    render(<AppShell>content</AppShell>);

    // Existing routes must be present
    const navLinks = screen.getAllByRole("link");
    const hrefs = navLinks.map((l) => l.getAttribute("href")).filter(Boolean);

    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/encounters");
    expect(hrefs).toContain("/audit");
  });

  it("does not render unimplemented routes", () => {
    render(<AppShell>content</AppShell>);

    const navLinks = screen.getAllByRole("link");
    const hrefs = navLinks.map((l) => l.getAttribute("href")).filter(Boolean);

    expect(hrefs).not.toContain("/patients");
    expect(hrefs).not.toContain("/protocols");
    expect(hrefs).not.toContain("/shifts");
    expect(hrefs).not.toContain("/profile");
    expect(hrefs).not.toContain("/settings");
  });
});

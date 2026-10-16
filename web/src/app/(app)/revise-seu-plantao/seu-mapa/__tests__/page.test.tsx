import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CalibrationMapPage from "../page";
import type { ShiftReviewMapState } from "@contracts/shift-review";
import { calibrationMap } from "@/components/domain/shift-review/__tests__/fixtures";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => apiGetMock(...args),
      post: (...args: unknown[]) => apiPostMock(...args),
    },
  };
});

const { ApiError } = await import("@/lib/api-client");

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<CalibrationMapPage />, { wrapper });
}

describe("CalibrationMapPage (Seu mapa)", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
  });

  it("draws the map from the physician answers, as a tab of the review", async () => {
    apiGetMock.mockResolvedValue({
      status: "ready",
      map: calibrationMap(),
    } satisfies ShiftReviewMapState);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Todas as respostas" })).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith("/shift-review/map");
    expect(screen.getByRole("heading", { level: 3, name: "Cefaleia" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seu mapa" })).toHaveAttribute("aria-current", "page");
    // Abrir o mapa não pede a geração das perguntas da semana.
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("shows how many answers are missing before the map", async () => {
    apiGetMock.mockResolvedValue({
      status: "insufficient",
      answered: 7,
      required: 20,
    } satisfies ShiftReviewMapState);

    renderPage();

    expect(await screen.findByText("Seu mapa ainda está se formando")).toBeInTheDocument();
    expect(
      screen.getByText("O mapa aparece com 20 respostas: com menos, não dá para tirar conclusão."),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "7 de 20 respostas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para a revisão da semana" })).toHaveAttribute(
      "href",
      "/revise-seu-plantao",
    );
    expect(screen.queryByRole("heading", { name: "Todas as respostas" })).not.toBeInTheDocument();
  });

  it("explains when the review is off", async () => {
    apiGetMock.mockResolvedValue({ status: "disabled" } satisfies ShiftReviewMapState);

    renderPage();

    expect(await screen.findByText("Mapa indisponível")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao Plantão" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("offers to try again when the map fails to load", async () => {
    apiGetMock
      .mockRejectedValueOnce(new ApiError(500, "Erro 500"))
      .mockResolvedValue({ status: "insufficient", answered: 2, required: 20 });

    renderPage();

    expect(await screen.findByText("Não foi possível carregar seu mapa")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Seu mapa ainda está se formando")).toBeInTheDocument();
  });
});

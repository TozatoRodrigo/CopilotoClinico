import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShiftReviewPage from "../page";
import type { ShiftReviewState } from "@contracts/shift-review";
import {
  answered,
  multipleChoice,
  reviewWith,
  trueFalse,
} from "@/components/domain/shift-review/__tests__/fixtures";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const toastErrorMock = vi.fn();

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

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

const { ApiError } = await import("@/lib/api-client");

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ShiftReviewPage />, { wrapper });
}

const ready: ShiftReviewState = {
  status: "ready",
  review: reviewWith([multipleChoice, trueFalse]),
};

describe("ShiftReviewPage (fluxo da revisão)", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("opening the review generates the questions, then shows one at a time until the summary", async () => {
    apiGetMock
      .mockResolvedValueOnce({ status: "available" } satisfies ShiftReviewState)
      .mockResolvedValue(ready);
    apiPostMock.mockImplementation((path: string) => {
      if (path === "/shift-review/current") {
        return Promise.resolve({ status: "generating" } satisfies ShiftReviewState);
      }
      if (path.endsWith(`${multipleChoice.id}/answer`)) {
        return Promise.resolve({
          status: "ready",
          review: reviewWith([answered(multipleChoice, 1, "know", 0), trueFalse]),
        } satisfies ShiftReviewState);
      }
      return Promise.resolve({
        status: "completed",
        review: reviewWith([
          answered(multipleChoice, 1, "know", 0),
          answered(trueFalse, 0, "guessed", 0),
        ]),
      } satisfies ShiftReviewState);
    });

    renderPage();

    // Abrir pede a geração; a tela espera as perguntas.
    expect(await screen.findByText("Preparando suas perguntas")).toBeInTheDocument();
    expect(apiPostMock).toHaveBeenCalledWith("/shift-review/current");

    // Pergunta 1 (consulta de novo enquanto gera).
    expect(
      await screen.findByRole("heading", { name: multipleChoice.stem }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Pergunta 1 de 2").length).toBeGreaterThan(0);
    expect(screen.queryByText(trueFalse.stem)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Punção lombar antes da imagem" }));
    await userEvent.click(screen.getByRole("button", { name: "Sei" }));

    expect(apiPostMock).toHaveBeenCalledWith(
      `/shift-review/questions/${multipleChoice.id}/answer`,
      { chosenOption: 1, confidence: "know" },
    );
    expect(await screen.findByText("Não foi dessa vez")).toBeInTheDocument();
    expect(screen.getByText("Diretriz de cefaleia na emergência · 2024")).toBeInTheDocument();

    // Pergunta 2.
    await userEvent.click(screen.getByRole("button", { name: "Próxima pergunta" }));
    expect(screen.getByRole("heading", { name: trueFalse.stem })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Verdadeiro" }));
    await userEvent.click(screen.getByRole("button", { name: "Chutei" }));
    expect(await screen.findByText("Você acertou")).toBeInTheDocument();

    // Resumo: acertos × o quanto sabia.
    await userEvent.click(screen.getByRole("button", { name: "Ver resumo" }));
    expect(screen.getByText("Você acertou 1 de 2")).toBeInTheDocument();
    expect(screen.getByText(/Errou marcando "Sei"/)).toBeInTheDocument();
    expect(screen.getByText(/Acertou chutando/)).toBeInTheDocument();
  });

  it("opens a finished review straight on the summary", async () => {
    apiGetMock.mockResolvedValue({
      status: "completed",
      review: reviewWith([
        answered(multipleChoice, 0, "know", 0),
        answered(trueFalse, 0, "unsure", 0),
      ]),
    } satisfies ShiftReviewState);

    renderPage();

    expect(await screen.findByText("Você acertou 2 de 2")).toBeInTheDocument();
    expect(screen.getByText("O que você marcou bateu com o resultado.")).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("explains when there is nothing to review", async () => {
    apiGetMock.mockResolvedValue({ status: "unavailable" } satisfies ShiftReviewState);

    renderPage();

    expect(await screen.findByText("Nada para revisar agora")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao Plantão" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("keeps the question on screen and warns when the answer fails", async () => {
    apiGetMock.mockResolvedValue(ready);
    apiPostMock.mockRejectedValue(new ApiError(500, "Erro 500"));

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Ressonância eletiva" }));
    await userEvent.click(screen.getByRole("button", { name: "Chutei" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Não foi possível enviar a resposta. Tente novamente.",
      ),
    );
    expect(screen.getByRole("heading", { name: multipleChoice.stem })).toBeInTheDocument();
  });
});

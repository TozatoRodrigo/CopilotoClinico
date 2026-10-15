import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShiftReviewEntry } from "../shift-review-entry";
import type { ShiftReviewState } from "@contracts/shift-review";
import { answered, multipleChoice, reviewWith, trueFalse } from "./fixtures";

const apiGetMock = vi.fn();

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiClient: { get: (...args: unknown[]) => apiGetMock(...args) } };
});

function renderEntry() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ShiftReviewEntry />, { wrapper });
}

describe("ShiftReviewEntry", () => {
  beforeEach(() => apiGetMock.mockReset());

  it("invites to the review when the week has something to review", async () => {
    apiGetMock.mockResolvedValue({ status: "available" } satisfies ShiftReviewState);

    renderEntry();

    expect(await screen.findByText("Revise seu plantão")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revisar" })).toHaveAttribute("href", "/revisao");
    expect(apiGetMock).toHaveBeenCalledWith("/shift-review/current");
  });

  it("offers to continue a review already started", async () => {
    apiGetMock.mockResolvedValue({
      status: "ready",
      review: reviewWith([answered(multipleChoice, 0, "know", 0), trueFalse]),
    } satisfies ShiftReviewState);

    renderEntry();

    expect(await screen.findByText("Falta 1 pergunta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar" })).toBeInTheDocument();
  });

  it.each<ShiftReviewState>([
    { status: "disabled" },
    { status: "unavailable" },
    {
      status: "completed",
      review: reviewWith([answered(multipleChoice, 0, "know", 0)]),
    },
  ])("stays hidden when the state is $status", async (state) => {
    apiGetMock.mockResolvedValue(state);

    const { container } = renderEntry();

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

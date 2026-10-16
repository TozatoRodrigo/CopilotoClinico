import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CopilotFeedbackTriagePage from "../page";
import type { CopilotFeedbackTriageItem, CopilotFeedbackTriagePage as TriagePage } from "@/lib/types";

const apiGetMock = vi.fn();
const apiPatchMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => apiGetMock(...args),
      patch: (...args: unknown[]) => apiPatchMock(...args),
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const { ApiError } = await import("@/lib/api-client");

/** Nomes dos arquivos que a tela mandou baixar (jsdom não baixa nem cria blob URL). */
let clickedDownloads: string[] = [];

const CASE_TEXT = "Febre há 4 dias, plaquetas 90 mil, dor retro-orbitária. Nome: [REDACTED_CPF].";

function item(overrides: Partial<CopilotFeedbackTriageItem> = {}): CopilotFeedbackTriageItem {
  return {
    id: "1a2b3c4d-5555-4555-8555-555555555555",
    kind: "wrong_scenario",
    comment: "Era dengue, foi para sepse.",
    status: "new",
    triageNote: null,
    triagedBy: null,
    triagedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    encounterId: "22222222-2222-4222-8222-222222222222",
    physicianId: "11111111-1111-4111-8111-111111111111",
    interaction: {
      id: "33333333-3333-4333-8333-333333333333",
      model: "claude-sonnet",
      turnIndex: 0,
      inputRedacted: CASE_TEXT,
      retrievalCoverage: "partial",
      retrievedChunkIds: ["chunk-sepse-1", "chunk-sepse-2"],
      citedChunkIds: ["chunk-sepse-1"],
      output: {
        mainHypothesis: "Sepse de foco indeterminado",
        recommendations: [
          { action: "Coletar hemoculturas", preliminary: false, citationChunkId: "chunk-sepse-1" },
        ],
        questions: [{ question: "Há sangramento?", criticality: "blocker" }],
        uncertainty: false,
      },
      createdAt: "2026-10-01T09:59:00.000Z",
    },
    ...overrides,
  };
}

function page(items: CopilotFeedbackTriageItem[], overrides: Partial<TriagePage> = {}): TriagePage {
  return {
    items,
    total: items.length,
    countsByStatus: { new: items.length, triaged: 0, converted_to_eval_case: 2, dismissed: 0 },
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<CopilotFeedbackTriagePage />, { wrapper: Wrapper });
}

async function openFirstReport(user: ReturnType<typeof userEvent.setup>) {
  const list = await screen.findByRole("list", { name: "Reportes de feedback" });
  await user.click(within(list).getAllByRole("button")[0]!);
  return screen.findByRole("dialog");
}

describe("Console admin — fila de triagem do feedback (F0-D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockResolvedValue(page([item()]));
    apiPatchMock.mockImplementation((_path: string, body: { status: CopilotFeedbackTriageItem["status"] }) =>
      Promise.resolve(item({ status: body.status })),
    );
  });

  beforeEach(() => {
    clickedDownloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedDownloads.push(this.download);
    });
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn().mockReturnValue("blob:draft"),
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens on the new reports, showing kind, comment and the copilot hypothesis", async () => {
    renderPage();

    expect(await screen.findByText("Era dengue, foi para sepse.")).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith("/admin/copilot-feedback", {
      limit: "20",
      offset: "0",
      status: "new",
    });
    expect(screen.getAllByText("Cenário errado").length).toBeGreaterThan(0);
    expect(screen.getByText("Hipótese do copiloto: Sepse de foco indeterminado")).toBeInTheDocument();
  });

  it("shows per-status counts on the tabs", async () => {
    renderPage();

    const convertedTab = await screen.findByRole("tab", { name: /Viraram caso/ });
    await waitFor(() => expect(convertedTab).toHaveTextContent("2"));
  });

  it("filters by status when another tab is chosen", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Era dengue, foi para sepse.");

    await user.click(screen.getByRole("tab", { name: /Descartados/ }));

    await waitFor(() =>
      expect(apiGetMock).toHaveBeenLastCalledWith("/admin/copilot-feedback", {
        limit: "20",
        offset: "0",
        status: "dismissed",
      }),
    );
  });

  it("opens a detail panel with the case as analysed, the output and the technical trace", async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await openFirstReport(user);

    expect(within(dialog).getByText(CASE_TEXT)).toBeInTheDocument();
    expect(within(dialog).getByText("Coletar hemoculturas")).toBeInTheDocument();
    expect(within(dialog).getByText("Cobertura parcial")).toBeInTheDocument();
    expect(within(dialog).getByText("2 recuperados · 1 citados")).toBeInTheDocument();
  });

  it("records the triage decision with the curator note", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openFirstReport(user);

    await user.type(within(dialog).getByLabelText("Nota de triagem"), "Base sem diretriz de dengue");
    await user.click(within(dialog).getByRole("button", { name: "Virou caso do gabarito" }));

    await waitFor(() =>
      expect(apiPatchMock).toHaveBeenCalledWith(
        "/admin/copilot-feedback/1a2b3c4d-5555-4555-8555-555555555555",
        { status: "converted_to_eval_case", triageNote: "Base sem diretriz de dengue" },
      ),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(await within(dialog).findByRole("button", { name: "Reabrir" })).toBeInTheDocument();
  });

  // CC-703 — o rascunho vem pronto do servidor (formato v2, texto
  // mascarado); a tela só o baixa como <id>.json.
  describe("rascunho do caso do gabarito", () => {
    const DRAFT_PATH = "/admin/copilot-feedback/1a2b3c4d-5555-4555-8555-555555555555/eval-case-draft";
    const draft = { schemaVersion: 2, id: "campo-1a2b3c4d", title: "A PREENCHER: título do caso" };

    beforeEach(() => {
      apiGetMock.mockImplementation((path: string) =>
        Promise.resolve(path === DRAFT_PATH ? draft : page([item()])),
      );
    });

    it("downloads the server draft as <id>.json", async () => {
      const user = userEvent.setup();
      renderPage();
      const dialog = await openFirstReport(user);

      await user.click(within(dialog).getByRole("button", { name: "Baixar rascunho do caso" }));

      await waitFor(() => expect(clickedDownloads).toEqual(["campo-1a2b3c4d.json"]));
      expect(apiGetMock).toHaveBeenCalledWith(DRAFT_PATH);
      expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringContaining("campo-1a2b3c4d.json"));
    });

    it("downloads the draft right after the report is marked as a gold case", async () => {
      const user = userEvent.setup();
      renderPage();
      const dialog = await openFirstReport(user);

      await user.click(within(dialog).getByRole("button", { name: "Virou caso do gabarito" }));

      await waitFor(() => expect(clickedDownloads).toEqual(["campo-1a2b3c4d.json"]));
      expect(apiPatchMock).toHaveBeenCalledWith(
        "/admin/copilot-feedback/1a2b3c4d-5555-4555-8555-555555555555",
        { status: "converted_to_eval_case", triageNote: null },
      );
    });

    it("does not download anything for the other triage decisions", async () => {
      const user = userEvent.setup();
      renderPage();
      const dialog = await openFirstReport(user);

      await user.click(within(dialog).getByRole("button", { name: "Marcar como triado" }));

      await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
      expect(apiGetMock).not.toHaveBeenCalledWith(DRAFT_PATH);
      expect(clickedDownloads).toEqual([]);
    });

    it("explains a failed export instead of downloading", async () => {
      apiGetMock.mockImplementation((path: string) =>
        path === DRAFT_PATH
          ? Promise.reject(new ApiError(404, "Feedback not found"))
          : Promise.resolve(page([item()])),
      );
      const user = userEvent.setup();
      renderPage();
      const dialog = await openFirstReport(user);

      await user.click(within(dialog).getByRole("button", { name: "Baixar rascunho do caso" }));

      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Feedback not found"));
      expect(clickedDownloads).toEqual([]);
    });
  });

  it("explains a refused access (non-curator) instead of an empty queue", async () => {
    apiGetMock.mockRejectedValue(new ApiError(403, "Apenas curadores clínicos podem acessar esta área"));

    renderPage();

    expect(await screen.findByText("Apenas curadores clínicos podem acessar esta área")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  it("shows an empty state when the new queue is clear", async () => {
    apiGetMock.mockResolvedValue(page([], { countsByStatus: { new: 0, triaged: 3, converted_to_eval_case: 0, dismissed: 0 } }));

    renderPage();

    expect(await screen.findByText("Fila zerada")).toBeInTheDocument();
  });
});

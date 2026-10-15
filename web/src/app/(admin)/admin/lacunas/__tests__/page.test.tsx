import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import KnowledgeGapQueuePage from "../page";
import type {
  KnowledgeGapQueueItem,
  KnowledgeGapQueuePage as QueuePage,
  KnowledgeGapWeeklyReport,
} from "@/lib/types";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastWarningMock = vi.fn();
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
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    warning: (...args: unknown[]) => toastWarningMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const GROUP_ID = "1a2b3c4d-5555-4555-8555-555555555555";

function item(overrides: Partial<KnowledgeGapQueueItem> = {}): KnowledgeGapQueueItem {
  return {
    id: GROUP_ID,
    topic: "adrenalina na anafilaxia",
    syndrome: "reacao-alergica",
    severity: "time_critical",
    priority: 9,
    status: "open",
    occurrences: 3,
    occurrencesLast7Days: 2,
    sources: { quick_question: 2, physician_not_found: 1 },
    firstSeenAt: "2026-10-01T10:00:00.000Z",
    lastSeenAt: "2026-10-15T10:00:00.000Z",
    queries: ["adrenalina na anafilaxia", "dose de adrenalina IM"],
    notes: ["Faltou a dose em criança"],
    draftId: null,
    coveredByCard: null,
    dismissReason: null,
    statusChangedAt: null,
    recurredAfterClose: false,
    ...overrides,
  };
}

function queuePage(items: KnowledgeGapQueueItem[], overrides: Partial<QueuePage> = {}): QueuePage {
  return {
    items,
    total: items.length,
    countsByStatus: { open: items.length, drafting: 0, covered: 4, dismissed: 0 },
    draftEnabled: true,
    ...overrides,
  };
}

const weekly: KnowledgeGapWeeklyReport = {
  from: "2026-10-09T12:00:00.000Z",
  to: "2026-10-16T12:00:00.000Z",
  occurrences: 7,
  bySource: { physician_not_found: 1, decision_no_card: 2, quick_question: 4 },
  newGroups: 2,
  closed: { covered: 1, dismissed: 0 },
  top: [
    {
      id: GROUP_ID,
      topic: "hidratação na dengue grupo C",
      syndrome: "febre",
      severity: "urgent",
      status: "open",
      occurrencesInWeek: 5,
      occurrences: 9,
      sourcesInWeek: { quick_question: 3, decision_no_card: 2 },
      lastSeenAt: "2026-10-15T10:00:00.000Z",
    },
  ],
};

function mockGets(queue: QueuePage) {
  apiGetMock.mockImplementation((path: string) =>
    Promise.resolve(path === "/admin/knowledge-gaps/weekly-report" ? weekly : queue),
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<KnowledgeGapQueuePage />, { wrapper: Wrapper });
}

async function openFirstGap(user: ReturnType<typeof userEvent.setup>) {
  const list = await screen.findByRole("list", { name: "Lacunas" });
  await user.click(within(list).getAllByRole("button")[0]!);
  return screen.findByRole("dialog");
}

describe("Console admin — fila de lacunas (CC-409)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGets(queuePage([item()]));
  });

  it("abre nas lacunas abertas, com gravidade, contagem e fontes", async () => {
    renderPage();

    expect(await screen.findByText("adrenalina na anafilaxia")).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith("/admin/knowledge-gaps", {
      limit: "20",
      offset: "0",
      status: "open",
    });
    expect(screen.getByText("Tempo-crítica")).toBeInTheDocument();
    expect(screen.getByText("3 vezes · 7 dias: 2")).toBeInTheDocument();
    expect(screen.getByText(/Não encontrei 1 · Pergunta rápida 2/)).toBeInTheDocument();
  });

  it("mostra o topo da semana para o ritual de sexta", async () => {
    renderPage();

    const top = await screen.findByRole("list", { name: "Lacunas mais frequentes da semana" });
    expect(within(top).getByText("hidratação na dengue grupo C")).toBeInTheDocument();
    expect(within(top).getByText("5×")).toBeInTheDocument();
    expect(screen.getByText(/7 lacunas · 2 temas novos · 1 coberto · 0 descartados/)).toBeInTheDocument();
  });

  it("conta por status nas abas e filtra ao trocar", async () => {
    const user = userEvent.setup();
    renderPage();

    const covered = await screen.findByRole("tab", { name: /Cobertas/ });
    await waitFor(() => expect(covered).toHaveTextContent("4"));
    await user.click(covered);

    await waitFor(() =>
      expect(apiGetMock).toHaveBeenLastCalledWith("/admin/knowledge-gaps", {
        limit: "20",
        offset: "0",
        status: "covered",
      }),
    );
  });

  it("o painel mostra as consultas e as notas, e gera o rascunho com o tema ajustado", async () => {
    apiPostMock.mockResolvedValue({
      item: item({ status: "drafting", draftId: "dddddddd-0000-4000-8000-000000000000" }),
      draft: { draft: { id: "dddddddd-0000-4000-8000-000000000000" }, cardIds: ["card-1", "card-2"] },
    });
    const user = userEvent.setup();
    renderPage();
    const dialog = await openFirstGap(user);

    expect(within(dialog).getByText("dose de adrenalina IM")).toBeInTheDocument();
    expect(within(dialog).getByText("Faltou a dose em criança")).toBeInTheDocument();

    const topic = within(dialog).getByLabelText("Tema do cartão");
    await user.clear(topic);
    await user.type(topic, "Anafilaxia: adrenalina IM");
    await user.click(within(dialog).getByRole("button", { name: "Gerar rascunho de cartão" }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/admin/knowledge-gaps/${GROUP_ID}/draft`, {
        topic: "Anafilaxia: adrenalina IM",
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Rascunho gerado: 2 cartões foram para revisão.");
    expect(await within(dialog).findByText("Em rascunho")).toBeInTheDocument();
  });

  it("avisa quando nenhum cartão passou na checagem de citação", async () => {
    apiPostMock.mockResolvedValue({ item: item({ draftId: "d-1" }), draft: { cardIds: [] } });
    const user = userEvent.setup();
    renderPage();
    const dialog = await openFirstGap(user);

    await user.click(within(dialog).getByRole("button", { name: "Gerar rascunho de cartão" }));

    await waitFor(() => expect(toastWarningMock).toHaveBeenCalled());
  });

  it("com o rascunho por IA desligado, o botão fica desabilitado e explica por quê", async () => {
    mockGets(queuePage([item()], { draftEnabled: false }));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openFirstGap(user);

    expect(within(dialog).getByRole("button", { name: "Gerar rascunho de cartão" })).toBeDisabled();
    expect(within(dialog).getByText(/KNOWLEDGE_CARDS_DRAFT_ENABLED/)).toBeInTheDocument();
  });

  it("descartar exige motivo e manda o motivo", async () => {
    apiPostMock.mockResolvedValue(
      item({ status: "dismissed", dismissReason: "Fora do escopo do PS" }),
    );
    const user = userEvent.setup();
    renderPage();
    const dialog = await openFirstGap(user);

    const dismiss = within(dialog).getByRole("button", { name: "Descartar" });
    expect(dismiss).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Motivo do descarte"), "Fora do escopo do PS");
    await user.click(dismiss);

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/admin/knowledge-gaps/${GROUP_ID}/dismiss`, {
        reason: "Fora do escopo do PS",
      }),
    );
    expect(await within(dialog).findByRole("button", { name: "Reabrir" })).toBeInTheDocument();
  });

  it("lacuna coberta mostra o cartão, avisa se voltou a aparecer e pode ser reaberta", async () => {
    mockGets(
      queuePage([
        item({
          status: "covered",
          coveredByCard: { id: "card-1", topic: "Anafilaxia" },
          recurredAfterClose: true,
        }),
      ]),
    );
    apiPostMock.mockResolvedValue(item());
    const user = userEvent.setup();
    renderPage();
    const dialog = await openFirstGap(user);

    expect(within(dialog).getByRole("link", { name: "Anafilaxia" })).toHaveAttribute(
      "href",
      "/cartoes/card-1",
    );
    expect(within(dialog).getByText("Voltou a aparecer depois de fechada")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Gerar rascunho de cartão" })).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Reabrir" }));
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/admin/knowledge-gaps/${GROUP_ID}/reopen`, {}),
    );
  });

  it("mostra o erro do servidor ao falhar a ação", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiPostMock.mockRejectedValue(new ApiError(409, "Reabra a lacuna antes de pedir rascunho"));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openFirstGap(user);

    await user.click(within(dialog).getByRole("button", { name: "Gerar rascunho de cartão" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("Reabra a lacuna antes de pedir rascunho"),
    );
  });
});

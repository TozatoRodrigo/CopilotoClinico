import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopilotConversation } from "../copilot-conversation";
import type { CopilotAnalysis, CopilotAnalyzeResponse } from "@/lib/types";
import type { StoredCopilotResult } from "@/hooks/use-copilot-conversation";

const apiPostMock = vi.fn();
const useOnlineStatusMock = vi.fn();
const addToQueueMock = vi.fn();
const syncOfflineQueueMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: { post: (...args: unknown[]) => apiPostMock(...args) },
}));

vi.mock("@/components/providers/offline-provider", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

vi.mock("@/lib/offline-queue", () => ({
  addToQueue: (...args: unknown[]) => addToQueueMock(...args),
}));

vi.mock("@/lib/copilot-queue", () => ({
  syncOfflineQueue: (...args: unknown[]) => syncOfflineQueueMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const baseRecommendation = {
  citationChunkId: "chunk-1",
  source: "Diretriz Influenza",
  sourceVersion: "2024",
  sourceText: "Pacientes com síndrome gripal e mais de 48h de evolução...",
  sourceUrl: "https://example.com/diretriz",
};

const analysisWithQuestions: CopilotAnalysis = {
  reasoning: "Quadro compatível com síndrome gripal.",
  recommendations: [
    {
      ...baseRecommendation,
      action: "Considerar oseltamivir",
      rationale: "Síndrome gripal com mais de 48h de evolução",
      confidence: 0.7,
      preliminary: true,
    },
  ],
  citations: [],
  uncertainty: false,
  uncertaintyReason: null,
  clarifyingQuestions: [
    {
      id: "q-immunosuppression",
      question: "O paciente é imunossuprimido?",
      why: "Imunossupressão muda a indicação de oseltamivir — Diretriz X.",
      criticality: "blocker",
      expectedAnswerType: "boolean",
    },
  ],
};

const analysisWithoutQuestions: CopilotAnalysis = {
  reasoning: "Quadro completo, sem pendências.",
  recommendations: [
    {
      ...baseRecommendation,
      action: "Tratamento sintomático",
      rationale: "Quadro leve",
      confidence: 0.95,
      preliminary: false,
    },
  ],
  citations: [],
  uncertainty: false,
  uncertaintyReason: null,
  clarifyingQuestions: [],
};

const respondResponse: CopilotAnalyzeResponse = {
  interactionId: "interaction-002",
  output: {
    reasoning: "Com a confirmação de imunossupressão, recomenda-se iniciar oseltamivir.",
    recommendations: [
      {
        ...baseRecommendation,
        action: "Iniciar oseltamivir 75mg 12/12h por 5 dias",
        rationale: "Imunossuprimido com síndrome gripal > 48h",
        confidence: 0.92,
        preliminary: false,
      },
    ],
    citations: [],
    uncertainty: false,
    uncertaintyReason: null,
    clarifyingQuestions: [],
  },
  citations: [],
  metadata: {
    piiDetected: false,
    injectionDetected: false,
    chunksRetrieved: 2,
    latencyMs: 500,
    cost: 0.003,
    model: "claude-3-sonnet",
  },
};

function renderConversation(analysis: CopilotAnalysis) {
  const initial: StoredCopilotResult = { interactionId: "interaction-001", analysis };
  return render(<CopilotConversation encounterId="enc-001" initial={initial} />);
}

describe("CopilotConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useOnlineStatusMock.mockReturnValue({ isOnline: true });
  });

  it("renders the existing layout unchanged when there are no clarifying questions", () => {
    renderConversation(analysisWithoutQuestions);

    expect(screen.queryByText("Perguntas do copiloto")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reanalisar" })).not.toBeInTheDocument();
    expect(screen.getByText("Tratamento sintomático")).toBeInTheDocument();
    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
  });

  it("PROT-004: labels institutional and public citations with the correct badge", () => {
    renderConversation({
      ...analysisWithoutQuestions,
      citations: [
        {
          source: "Protocolo Sepse Hospital Central",
          sourceVersion: "1.0",
          chunkId: "chunk-institutional",
          text: "Bundle institucional de sepse.",
          institutionId: "institution-a",
          origin: "institutional",
        },
        {
          source: "Diretriz SBC Sepse",
          sourceVersion: "2.0",
          chunkId: "chunk-public",
          text: "Diretriz pública sobre sepse.",
          institutionId: null,
          origin: "public",
        },
      ],
    });

    expect(screen.getByText("Protocolo institucional")).toBeInTheDocument();
    expect(screen.getByText("Diretriz pública")).toBeInTheDocument();
  });

  it("shows the questions section, a dimmed preliminary recommendation, and a disabled reanalyze button", () => {
    renderConversation(analysisWithQuestions);

    expect(screen.getByText("Perguntas do copiloto")).toBeInTheDocument();
    expect(screen.getByText("Preliminar — responda as perguntas acima")).toBeInTheDocument();

    const reanalyzeButton = screen.getByRole("button", { name: "Reanalisar" });
    expect(reanalyzeButton).toBeDisabled();
  });

  it("answering a question with one tap enables Reanalisar, and submitting refines the result", async () => {
    apiPostMock.mockResolvedValue(respondResponse);
    const user = userEvent.setup();

    renderConversation(analysisWithQuestions);

    await user.click(screen.getByRole("button", { name: "Sim" }));

    const reanalyzeButton = screen.getByRole("button", { name: "Reanalisar" });
    expect(reanalyzeButton).toBeEnabled();

    await user.click(reanalyzeButton);

    expect(apiPostMock).toHaveBeenCalledWith("/encounters/enc-001/copilot/respond", {
      interactionId: "interaction-001",
      answers: [{ questionId: "q-immunosuppression", answer: true }],
    });

    await waitFor(() => {
      expect(
        screen.getByText("Iniciar oseltamivir 75mg 12/12h por 5 dias"),
      ).toBeInTheDocument();
    });

    // Refined recommendation is no longer preliminary, and questions are resolved.
    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
    expect(screen.queryByText("Perguntas do copiloto")).not.toBeInTheDocument();

    // Previous turn is preserved in the accordion history.
    expect(screen.getByText("Histórico de turnos")).toBeInTheDocument();
    expect(screen.getByText("Turno 1")).toBeInTheDocument();
  });

  it("queues the answer offline and shows a pending message when there is no connection", async () => {
    useOnlineStatusMock.mockReturnValue({ isOnline: false });
    const user = userEvent.setup();

    renderConversation(analysisWithQuestions);

    await user.click(screen.getByRole("button", { name: "Sim" }));
    await user.click(screen.getByRole("button", { name: "Reanalisar" }));

    expect(addToQueueMock).toHaveBeenCalledWith({
      type: "respond",
      encounterId: "enc-001",
      interactionId: "interaction-001",
      answers: [{ questionId: "q-immunosuppression", answer: true }],
    });
    expect(apiPostMock).not.toHaveBeenCalled();

    expect(await screen.findByText("Resposta enfileirada")).toBeInTheDocument();
  });
});

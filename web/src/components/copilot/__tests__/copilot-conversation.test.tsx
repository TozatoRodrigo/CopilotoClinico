import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  category: "therapeutic" as const,
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
  redFlags: [],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
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
  redFlags: [],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
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
    redFlags: [],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
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
    turnIndex: 1,
    maxTurns: 5,
  },
};

// RecommendationCard usa <Tooltip> (dica de confiança) internamente, que
// exige um <TooltipProvider> na árvore — presente no layout raiz real do
// app, mas não neste render isolado de teste. Sem isto, qualquer análise
// com pelo menos uma recomendação derruba o teste inteiro.
function renderConversation(analysis: CopilotAnalysis) {
  const initial: StoredCopilotResult = {
    interactionId: "interaction-001",
    analysis,
    turnIndex: 0,
    maxTurns: 5,
  };
  return render(
    <TooltipProvider>
      <CopilotConversation encounterId="enc-001" initial={initial} />
    </TooltipProvider>,
  );
}

function renderConversationWithInitial(initial: StoredCopilotResult) {
  return render(
    <TooltipProvider>
      <CopilotConversation encounterId="enc-001" initial={initial} />
    </TooltipProvider>,
  );
}

// UX-02 — o caso que antes deixava o médico sem próximo passo: incerteza
// declarada, mas nenhuma clarifyingQuestion para responder.
const analysisUncertainNoQuestions: CopilotAnalysis = {
  reasoning: "Quadro pouco caracterizado.",
  recommendations: [],
  citations: [],
  redFlags: [],
  uncertainty: true,
  uncertaintyReason: "Nenhum protocolo cobre cefaleia inespecífica na base atual.",
  differentials: [],
  clarifyingQuestions: [],
};

describe("CopilotConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useOnlineStatusMock.mockReturnValue({ isOnline: true });
  });

  it("renders the existing layout unchanged when there are no clarifying questions", () => {
    renderConversation(analysisWithoutQuestions);

    expect(screen.queryByText("Para orientar com segurança, preciso de:")).not.toBeInTheDocument();
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

    expect(screen.getByText("Para orientar com segurança, preciso de:")).toBeInTheDocument();
    expect(screen.getByText("Preliminar — responda as perguntas acima")).toBeInTheDocument();

    const reanalyzeButton = screen.getByRole("button", { name: "Reanalisar" });
    expect(reanalyzeButton).toBeDisabled();
  });

  it('renders stabilization recommendations before diagnostic ones and labels them as "Agora"', () => {
    renderConversation({
      ...analysisWithoutQuestions,
      recommendations: [
        {
          ...baseRecommendation,
          action: "Solicitar gasometria arterial",
          rationale: "Ajuda a definir gravidade",
          confidence: 0.99,
          preliminary: false,
          category: "diagnostic",
        },
        {
          ...baseRecommendation,
          action: "Iniciar oxigênio suplementar e monitorização",
          rationale: "Paciente hipoxêmico e em risco de deterioração",
          confidence: 0.6,
          preliminary: false,
          category: "stabilization",
        },
      ],
    });

    const stabilization = screen.getByText("Iniciar oxigênio suplementar e monitorização");
    const diagnostic = screen.getByText("Solicitar gasometria arterial");

    expect(
      stabilization.compareDocumentPosition(diagnostic) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Agora")).toBeInTheDocument();
  });

  it('renders the "Já considerou?" section when anti-anchoring differentials are present', () => {
    renderConversation({
      ...analysisWithoutQuestions,
      differentials: [
        {
          hypothesis: "Etiologia vascular",
          whyConsider: "Lombalgia aguda em idoso hipertenso pode ser mímico perigoso.",
          whatDistinguishes: "Dor abrupta, alteração de pulsos e angioTC.",
          cannotMiss: false,
        },
      ],
    });

    expect(screen.getByText("Já considerou?")).toBeInTheDocument();
    expect(screen.getByText("Etiologia vascular")).toBeInTheDocument();
    expect(screen.getByText(/O que diferencia:/)).toBeInTheDocument();
    // Sem cannotMiss, não deve mostrar o rótulo "não pode passar".
    expect(screen.queryByText("Não pode passar")).not.toBeInTheDocument();
  });

  // PI-03 — diferenciais "não pode perder".
  describe("PI-03: diferenciais cannotMiss", () => {
    it('shows the "Não pode passar" badge with the qualitative time window for a cannot-miss differential', () => {
      renderConversation({
        ...analysisWithoutQuestions,
        differentials: [
          {
            hypothesis: "Dissecção de aorta",
            whyConsider: "Dor torácica súbita irradiada para o dorso.",
            whatDistinguishes: "Assimetria de pulsos e angioTC.",
            cannotMiss: true,
            timeToHarm: "minutos",
          },
        ],
      });

      expect(screen.getByText(/Não pode passar/)).toBeInTheDocument();
      expect(screen.getByText(/minutos/)).toBeInTheDocument();
    });

    it("sorts cannot-miss differentials first without discarding the others", () => {
      renderConversation({
        ...analysisWithoutQuestions,
        differentials: [
          {
            hypothesis: "Costocondrite",
            whyConsider: "Dor reprodutível à palpação.",
            whatDistinguishes: "Exame físico dirigido.",
            cannotMiss: false,
          },
          {
            hypothesis: "Dissecção de aorta",
            whyConsider: "Dor torácica súbita irradiada.",
            whatDistinguishes: "Assimetria de pulsos e angioTC.",
            cannotMiss: true,
            timeToHarm: "minutos",
          },
        ],
      });

      const aorta = screen.getByText("Dissecção de aorta");
      const costo = screen.getByText("Costocondrite");
      // cannotMiss aparece primeiro no DOM mesmo tendo vindo depois no array.
      expect(
        aorta.compareDocumentPosition(costo) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Nenhum dos dois é descartado.
      expect(costo).toBeInTheDocument();
    });

    it("omits the badge entirely when timeToHarm is absent (defensive — should not happen post-validator, but UI must not crash)", () => {
      renderConversation({
        ...analysisWithoutQuestions,
        differentials: [
          {
            hypothesis: "Choque obstrutivo",
            whyConsider: "Hipotensão refratária.",
            whatDistinguishes: "Ecocardiograma point-of-care.",
            cannotMiss: true,
          },
        ],
      });

      expect(screen.getByText("Não pode passar")).toBeInTheDocument();
    });
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
    expect(screen.queryByText("Para orientar com segurança, preciso de:")).not.toBeInTheDocument();

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

  // ──── UX-02: nenhum estado sem próximo passo ─────────────────────────
  describe("UX-02: nenhum estado sem próximo passo", () => {
    it("shows an actionable uncertainty banner (complement + guidelines link) instead of a dead end", () => {
      renderConversation(analysisUncertainNoQuestions);

      expect(screen.getByText("Incerteza na análise")).toBeInTheDocument();
      expect(
        screen.getByText("Nenhum protocolo cobre cefaleia inespecífica na base atual."),
      ).toBeInTheDocument();

      const complementButton = screen.getByRole("button", { name: "Complementar o caso" });
      expect(complementButton).toBeInTheDocument();

      const guidelinesLink = screen.getByRole("link", { name: "Buscar nas diretrizes" });
      expect(guidelinesLink).toHaveAttribute(
        "href",
        "/guidelines?q=Nenhum%20protocolo%20cobre%20cefaleia%20inespec%C3%ADfica%20na%20base%20atual.",
      );
    });

    it("opens the free-text complement field, submits it via /respond with a synthetic question, and clears on success", async () => {
      apiPostMock.mockResolvedValue(respondResponse);
      const user = userEvent.setup();

      renderConversation(analysisUncertainNoQuestions);

      await user.click(screen.getByRole("button", { name: "Complementar o caso" }));

      const textarea = screen.getByLabelText("Complementar informações do caso");
      await user.type(textarea, "Início súbito há 2h, sem febre.");
      await user.click(screen.getByRole("button", { name: "Reanalisar com o complemento" }));

      expect(apiPostMock).toHaveBeenCalledWith("/encounters/enc-001/copilot/respond", {
        interactionId: "interaction-001",
        answers: [
          {
            questionId: "Informações adicionais fornecidas pelo médico",
            answer: "Início súbito há 2h, sem febre.",
          },
        ],
      });

      // A nova análise (respondResponse) não tem uncertainty=true, então o
      // banner inteiro (e o campo) somem sozinhos — sem lógica extra de
      // "detectar sucesso e fechar".
      await waitFor(() => {
        expect(screen.queryByText("Incerteza na análise")).not.toBeInTheDocument();
      });
    });

    it("keeps the typed complement text visible after a failed submit, so the médico does not lose it", async () => {
      apiPostMock.mockRejectedValue(new Error("Falha de rede"));
      const user = userEvent.setup();

      renderConversation(analysisUncertainNoQuestions);

      await user.click(screen.getByRole("button", { name: "Complementar o caso" }));
      const textarea = screen.getByLabelText("Complementar informações do caso");
      await user.type(textarea, "Texto que não pode se perder");
      await user.click(screen.getByRole("button", { name: "Reanalisar com o complemento" }));

      expect(await screen.findByText("Falha de rede")).toBeInTheDocument();
      // O campo continua aberto E com o texto digitado preservado.
      expect(screen.getByLabelText("Complementar informações do caso")).toHaveValue(
        "Texto que não pode se perder",
      );
    });

    it("queues the complement offline, same as answering a pending question", async () => {
      useOnlineStatusMock.mockReturnValue({ isOnline: false });
      const user = userEvent.setup();

      renderConversation(analysisUncertainNoQuestions);

      await user.click(screen.getByRole("button", { name: "Complementar o caso" }));
      const textarea = screen.getByLabelText("Complementar informações do caso");
      await user.type(textarea, "Sem febre, sem trauma.");
      await user.click(screen.getByRole("button", { name: "Reanalisar com o complemento" }));

      expect(addToQueueMock).toHaveBeenCalledWith({
        type: "respond",
        encounterId: "enc-001",
        interactionId: "interaction-001",
        answers: [
          {
            questionId: "Informações adicionais fornecidas pelo médico",
            answer: "Sem febre, sem trauma.",
          },
        ],
      });
      expect(await screen.findByText("Resposta enfileirada")).toBeInTheDocument();
    });

    it("does not offer to complement the case once the last allowed turn has been reached", () => {
      renderConversationWithInitial({
        interactionId: "interaction-005",
        analysis: analysisUncertainNoQuestions,
        turnIndex: 4,
        maxTurns: 5,
      });

      expect(screen.getByText("Incerteza na análise")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Complementar o caso" }),
      ).not.toBeInTheDocument();
      // A busca manual continua disponível — não é uma ação que dependa de turno.
      expect(screen.getByRole("link", { name: "Buscar nas diretrizes" })).toBeInTheDocument();
    });

    it("does not render the complement field for a certain analysis with no uncertainty", () => {
      renderConversation(analysisWithoutQuestions);

      expect(screen.queryByText("Incerteza na análise")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Complementar o caso" }),
      ).not.toBeInTheDocument();
    });
  });
});

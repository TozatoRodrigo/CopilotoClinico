import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  CaseConversationResponse,
  ConversationTurn,
  IntakeView,
} from "@/lib/types";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const startFromIntakeMock = vi.fn();
const addToQueueMock = vi.fn();
let online = true;

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
vi.mock("@/hooks/use-copilot-stream", () => ({
  useCopilotStream: () => ({
    startFromIntake: (...args: unknown[]) => startFromIntakeMock(...args),
    status: "idle",
    understanding: null,
  }),
}));
vi.mock("@/components/providers/offline-provider", () => ({
  useOnlineStatus: () => ({ isOnline: online }),
}));
vi.mock("@/lib/offline-queue", () => ({
  addToQueue: (...args: unknown[]) => addToQueueMock(...args),
}));
vi.mock("@/lib/copilot-queue", () => ({
  syncOfflineQueue: () => Promise.resolve({ processed: 0, failed: 0, respondedEncounters: [] }),
}));
vi.mock("@/components/domain/install-prompt-banner", () => ({
  markFirstAnalysisDone: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const { useCaseConversation } = await import("../use-case-conversation");
const { ApiError } = await import("@/lib/api-client");
const { attachToCase, readCaseAttachments } = await import("@/lib/case-tool-link");

const ENCOUNTER_ID = "enc-guiado-1";
const INTAKE_ID = "00000000-0000-4000-8000-000000000001";
const caseInput = {
  caseText: "Mulher, 34 anos, cefaleia forte desde ontem.",
  context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
  redFlags: {},
};

function intakeView(overrides: Partial<IntakeView> = {}): IntakeView {
  return {
    intakeId: INTAKE_ID,
    path: "ask",
    status: "asking",
    closeReason: null,
    caseText: caseInput.caseText,
    summary: "Mulher, 34 anos, cefaleia intensa há 12 h.",
    instabilityFindings: [],
    questions: [
      {
        id: "intake-1",
        question: "A dor chegou ao máximo em menos de 1 minuto?",
        answerType: "boolean",
        choices: ["Sim", "Não", "Não sei"],
        unit: null,
        vitalSigns: [],
        separates: ["HSA", "Enxaqueca"],
        why: "Início súbito pede TC já.",
      },
    ],
    answers: [],
    pendingQuestionId: "intake-1",
    analysisInteractionId: null,
    analysisInProgress: false,
    createdAt: "2026-10-12T10:00:00.000Z",
    ...overrides,
  };
}

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    interactionId: "interaction-1",
    caseText: caseInput.caseText,
    output: {
      reasoning: "Cefaleia sem sinais de alarme.",
      redFlags: [],
      recommendations: [],
      differentials: [],
      clarifyingQuestions: [],
    },
    citations: [],
    uncertainty: false,
    uncertaintyReason: null,
    createdAt: "2026-10-12T10:01:00.000Z",
    turnIndex: 0,
    retrievalCoverage: null,
    answeredQuestions: [],
    ...overrides,
  };
}

function conversation(overrides: Partial<CaseConversationResponse> = {}): CaseConversationResponse {
  return { intake: null, turns: [], maxTurns: 5, ...overrides };
}

function renderConversation() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCaseConversation(ENCOUNTER_ID), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  online = true;
  apiGetMock.mockResolvedValue(conversation());
  startFromIntakeMock.mockResolvedValue({ interactionId: "interaction-1" });
});

describe("useCaseConversation", () => {
  describe("before the plan", () => {
    it("opens with the case editor when the case has no conversation", async () => {
      const { result } = renderConversation();

      await waitFor(() => expect(result.current.phase).toBe("compose"));
    });

    it("asks the first question after reading the case, without starting the plan", async () => {
      apiPostMock.mockResolvedValue(intakeView());
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.phase).toBe("compose"));

      await act(async () => {
        await expect(result.current.startCase(caseInput)).resolves.toBe("started");
      });

      expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/intake`, caseInput);
      await waitFor(() => expect(result.current.phase).toBe("asking"));
      expect(startFromIntakeMock).not.toHaveBeenCalled();
    });

    it("starts the plan by itself when the case needs no question", async () => {
      apiPostMock.mockResolvedValue(
        intakeView({ path: "complete", status: "closed", closeReason: "not_needed", pendingQuestionId: null }),
      );
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.phase).toBe("compose"));

      await act(async () => {
        await result.current.startCase(caseInput);
      });

      await waitFor(() => expect(startFromIntakeMock).toHaveBeenCalledWith(INTAKE_ID));
      expect(startFromIntakeMock).toHaveBeenCalledTimes(1);
    });

    it("starts the plan after the last answer", async () => {
      apiGetMock.mockResolvedValue(conversation({ intake: intakeView() }));
      apiPostMock.mockResolvedValue(
        intakeView({
          status: "closed",
          closeReason: "all_answered",
          pendingQuestionId: null,
          answers: [
            {
              questionId: "intake-1",
              question: "A dor chegou ao máximo em menos de 1 minuto?",
              answer: "Não",
              channel: "tap",
              answeredAt: "2026-10-12T10:00:10.000Z",
            },
          ],
        }),
      );
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.phase).toBe("asking"));

      await act(async () => {
        await expect(result.current.answerIntake("intake-1", "Não", "Não", "tap")).resolves.toBe(true);
      });

      await waitFor(() => expect(startFromIntakeMock).toHaveBeenCalledWith(INTAKE_ID));
      expect(apiPostMock).toHaveBeenCalledWith(
        `/encounters/${ENCOUNTER_ID}/copilot/intake/${INTAKE_ID}/answers`,
        { questionId: "intake-1", answer: "Não", channel: "tap" },
      );
    });

    it("skips the open questions", async () => {
      apiGetMock.mockResolvedValue(conversation({ intake: intakeView() }));
      apiPostMock.mockResolvedValue(
        intakeView({ status: "closed", closeReason: "skipped", pendingQuestionId: null }),
      );
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.phase).toBe("asking"));

      act(() => result.current.skipIntake());

      await waitFor(() =>
        expect(apiPostMock).toHaveBeenCalledWith(
          `/encounters/${ENCOUNTER_ID}/copilot/intake/${INTAKE_ID}/skip`,
        ),
      );
      await waitFor(() => expect(startFromIntakeMock).toHaveBeenCalled());
    });

    it("queues the case when there is no connection", async () => {
      online = false;
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.phase).toBe("compose"));

      await act(async () => {
        await expect(result.current.startCase(caseInput)).resolves.toBe("queued");
      });

      expect(addToQueueMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "analyze", encounterId: ENCOUNTER_ID }),
      );
      expect(apiPostMock).not.toHaveBeenCalled();
    });
  });

  describe("building the plan", () => {
    const closed = intakeView({
      path: "complete",
      status: "closed",
      closeReason: "not_needed",
      pendingQuestionId: null,
    });

    it("picks up a plan interrupted between the last answer and the plan", async () => {
      apiGetMock.mockResolvedValue(conversation({ intake: closed }));

      renderConversation();

      await waitFor(() => expect(startFromIntakeMock).toHaveBeenCalledWith(INTAKE_ID));
    });

    it("asks for the plan without streaming when the stream drops and nothing is running", async () => {
      apiGetMock.mockResolvedValue(conversation({ intake: closed }));
      startFromIntakeMock.mockRejectedValue(new Error("Conexão de streaming perdida."));
      apiPostMock.mockResolvedValue({ interactionId: "interaction-1" });

      renderConversation();

      await waitFor(() =>
        expect(apiPostMock).toHaveBeenCalledWith(
          `/encounters/${ENCOUNTER_ID}/copilot/intake/${INTAKE_ID}/analyze`,
        ),
      );
    });

    it("waits for a plan that is still being made instead of asking for another", async () => {
      apiGetMock
        .mockResolvedValueOnce(conversation({ intake: closed }))
        .mockResolvedValue(conversation({ intake: { ...closed, analysisInProgress: true } }));
      startFromIntakeMock.mockRejectedValue(new Error("Conexão de streaming perdida."));

      const { result } = renderConversation();

      await waitFor(() => expect(startFromIntakeMock).toHaveBeenCalled());
      await waitFor(() => expect(result.current.phase).toBe("planning"));
      expect(apiPostMock).not.toHaveBeenCalled();
    });

    it("offers a retry when a plan it asked for never arrives", async () => {
      apiGetMock
        .mockResolvedValueOnce(conversation({ intake: closed }))
        .mockResolvedValueOnce(conversation({ intake: { ...closed, analysisInProgress: true } }))
        .mockResolvedValue(conversation({ intake: closed }));
      startFromIntakeMock.mockRejectedValue(new Error("Conexão de streaming perdida."));

      const { result } = renderConversation();

      await waitFor(() => expect(result.current.phase).toBe("plan_failed"), { timeout: 3000 });
      expect(startFromIntakeMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the typed answer when it could not be sent", async () => {
      online = false;
      apiGetMock.mockResolvedValue(conversation({ intake: intakeView() }));
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.phase).toBe("asking"));

      await act(async () => {
        await expect(result.current.answerIntake("intake-1", "Não", "Não", "text")).resolves.toBe(
          false,
        );
      });
      expect(apiPostMock).not.toHaveBeenCalled();
    });

    it("shows the failure and lets the physician try again", async () => {
      apiGetMock.mockResolvedValue(conversation({ intake: closed }));
      startFromIntakeMock.mockRejectedValue(new Error("Conexão de streaming perdida."));
      apiPostMock.mockRejectedValue(new ApiError(400, "AI output validation failed"));

      const { result } = renderConversation();

      await waitFor(() => expect(result.current.phase).toBe("plan_failed"));
      expect(result.current.planError).toBe("AI output validation failed");

      startFromIntakeMock.mockResolvedValue({ interactionId: "interaction-1" });
      act(() => result.current.retryPlan());
      await waitFor(() => expect(startFromIntakeMock).toHaveBeenCalledTimes(2));
    });
  });

  describe("after the plan", () => {
    const withQuestions = turn({
      output: {
        reasoning: "Cefaleia; falta excluir meningite.",
        redFlags: [],
        recommendations: [],
        differentials: [],
        clarifyingQuestions: [
          {
            id: "q-febre",
            question: "Tem febre?",
            why: "Febre com cefaleia pede punção.",
            criticality: "blocker",
            expectedAnswerType: "boolean",
          },
          {
            id: "q-glicemia",
            question: "Glicemia capilar?",
            why: "Hipoglicemia confunde o quadro.",
            criticality: "important",
            expectedAnswerType: "number",
          },
        ],
      },
    });

    it("asks the plan questions one at a time and rebuilds the plan after the last", async () => {
      apiGetMock.mockResolvedValue(conversation({ turns: [withQuestions] }));
      apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.followUps.pending?.id).toBe("q-febre"));

      act(() => result.current.answerFollowUp("q-febre", "Não", "Não"));

      expect(result.current.followUps.pending?.id).toBe("q-glicemia");
      expect(apiPostMock).not.toHaveBeenCalled();

      act(() => result.current.answerFollowUp("q-glicemia", 98, "98"));

      await waitFor(() =>
        expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
          interactionId: "interaction-1",
          answers: [
            { questionId: "q-febre", answer: "Não" },
            { questionId: "q-glicemia", answer: 98 },
          ],
        }),
      );
    });

    it("keeps the plan when the physician moves on without answering", async () => {
      apiGetMock.mockResolvedValue(conversation({ turns: [withQuestions] }));
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.followUps.pending).not.toBeNull());

      act(() => result.current.finishFollowUps());

      expect(result.current.followUps.pending).toBeNull();
      expect(apiPostMock).not.toHaveBeenCalled();
    });

    it("keeps the answers given so far across a reload", async () => {
      apiGetMock.mockResolvedValue(conversation({ turns: [withQuestions] }));
      const first = renderConversation();
      await waitFor(() => expect(first.result.current.followUps.pending?.id).toBe("q-febre"));
      act(() => first.result.current.answerFollowUp("q-febre", "Sim", "Sim"));
      first.unmount();

      const second = renderConversation();

      await waitFor(() => expect(second.result.current.followUps.pending?.id).toBe("q-glicemia"));
    });

    it("adds free text to the case and rebuilds the plan", async () => {
      apiGetMock.mockResolvedValue(conversation({ turns: [turn()] }));
      apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
      const { result } = renderConversation();
      await waitFor(() => expect(result.current.phase).toBe("plan"));

      act(() => result.current.complementCase("TC de crânio sem sangramento"));

      await waitFor(() =>
        expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
          interactionId: "interaction-1",
          answers: [
            {
              questionId: "Informações adicionais fornecidas pelo médico",
              answer: "TC de crânio sem sangramento",
            },
          ],
        }),
      );
    });

    describe("resultados de ferramenta anexados ao caso (CC-332)", () => {
      const nihss = "NIHSS: 9 — AVC moderado.";

      beforeEach(() => vi.stubEnv("NEXT_PUBLIC_FERRAMENTAS", "on"));
      afterEach(() => vi.unstubAllEnvs());

      it("with the tools off in the web, the reanalysis goes as before", async () => {
        vi.stubEnv("NEXT_PUBLIC_FERRAMENTAS", "");
        attachToCase(ENCOUNTER_ID, { toolName: "NIHSS", text: nihss });
        apiGetMock.mockResolvedValue(conversation({ turns: [turn()] }));
        apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
        const { result } = renderConversation();
        await waitFor(() => expect(result.current.phase).toBe("plan"));
        expect(result.current.toolResults.items).toEqual([]);

        act(() => result.current.complementCase("TC sem sangramento"));

        await waitFor(() =>
          expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
            interactionId: "interaction-1",
            answers: [
              { questionId: "Informações adicionais fornecidas pelo médico", answer: "TC sem sangramento" },
            ],
          }),
        );
      });

      it("go with the next reanalysis, after the physician's own answer", async () => {
        attachToCase(ENCOUNTER_ID, { toolName: "NIHSS", text: nihss });
        apiGetMock.mockResolvedValue(conversation({ turns: [turn()] }));
        apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
        const { result } = renderConversation();
        await waitFor(() => expect(result.current.phase).toBe("plan"));
        expect(result.current.toolResults.items.map(({ text }) => text)).toEqual([nihss]);

        act(() => result.current.complementCase("TC de crânio sem sangramento"));

        await waitFor(() =>
          expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
            interactionId: "interaction-1",
            answers: [
              {
                questionId: "Informações adicionais fornecidas pelo médico",
                answer: "TC de crânio sem sangramento",
              },
              { questionId: "resultado-de-ferramenta", answer: nihss },
            ],
          }),
        );
        // Entraram nesta reanálise: saem da espera.
        await waitFor(() => expect(result.current.toolResults.items).toEqual([]));
        expect(readCaseAttachments(ENCOUNTER_ID)).toEqual([]);
      });

      it("rebuild the plan on their own, from the attachments block", async () => {
        attachToCase(ENCOUNTER_ID, { toolName: "Choque séptico", text: "Perfil: TEC alterado." });
        apiGetMock.mockResolvedValue(conversation({ turns: [turn()] }));
        apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
        const { result } = renderConversation();
        await waitFor(() => expect(result.current.phase).toBe("plan"));

        act(() => result.current.toolResults.send());

        await waitFor(() =>
          expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
            interactionId: "interaction-1",
            answers: [
              { questionId: "resultado-de-ferramenta", answer: "Choque séptico\nPerfil: TEC alterado." },
            ],
          }),
        );
      });

      it("stay attached when the reanalysis fails, and the retry still carries them", async () => {
        attachToCase(ENCOUNTER_ID, { toolName: "NIHSS", text: nihss });
        apiGetMock.mockResolvedValue(conversation({ turns: [turn()] }));
        apiPostMock.mockRejectedValueOnce(new Error("timeout"));
        const { result } = renderConversation();
        await waitFor(() => expect(result.current.phase).toBe("plan"));

        act(() => result.current.toolResults.send());
        await waitFor(() => expect(result.current.respondError).not.toBeNull());
        expect(result.current.toolResults.items).toHaveLength(1);

        apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
        act(() => result.current.retryRespond());
        await waitFor(() => expect(result.current.toolResults.items).toEqual([]));
        expect(apiPostMock).toHaveBeenLastCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
          interactionId: "interaction-1",
          answers: [{ questionId: "resultado-de-ferramenta", answer: nihss }],
        });
      });

      it("removing one keeps it out of the reanalysis", async () => {
        const [first] = attachToCase(ENCOUNTER_ID, { toolName: "NIHSS", text: nihss });
        apiGetMock.mockResolvedValue(conversation({ turns: [turn()] }));
        const { result } = renderConversation();
        await waitFor(() => expect(result.current.phase).toBe("plan"));

        act(() => result.current.toolResults.remove(first!.id));

        expect(result.current.toolResults.items).toEqual([]);
        act(() => result.current.toolResults.send());
        expect(apiPostMock).not.toHaveBeenCalled();
      });
    });

    it("stops offering new rounds at the turn limit", async () => {
      apiGetMock.mockResolvedValue(conversation({ turns: [turn({ turnIndex: 4 })] }));
      const { result } = renderConversation();

      await waitFor(() => expect(result.current.phase).toBe("plan"));
      expect(result.current.canRespond).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useCopilotConversation,
  STORAGE_KEY_PREFIX,
  type StoredCopilotResult,
} from "../use-copilot-conversation";
import type { CopilotAnalysis, CopilotAnalyzeResponse } from "@/lib/types";

const apiPostMock = vi.fn();
const useOnlineStatusMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: { post: (...args: unknown[]) => apiPostMock(...args) },
}));

vi.mock("@/components/providers/offline-provider", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

vi.mock("@/lib/offline-queue", () => ({
  addToQueue: vi.fn(),
}));

vi.mock("@/lib/copilot-queue", () => ({
  syncOfflineQueue: vi.fn().mockResolvedValue({ respondedEncounters: [] }),
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const ENCOUNTER_ID = "enc-ux08";
const DRAFT_KEY = `copilot_draft_answers_${ENCOUNTER_ID}`;

function makeAnalysis(overrides: Partial<CopilotAnalysis> = {}): CopilotAnalysis {
  return {
    reasoning: "Quadro em avaliação.",
    redFlags: [],
    recommendations: [],
    citations: [],
    uncertainty: true,
    uncertaintyReason: "Evidência insuficiente.",
    differentials: [],
    clarifyingQuestions: [
      {
        id: "q-pa",
        question: "Quais são PA, FC, FR e SpO2?",
        why: "Define estabilidade hemodinâmica.",
        criticality: "blocker",
        expectedAnswerType: "text",
      },
    ],
    ...overrides,
  };
}

function makeInitial(overrides: Partial<StoredCopilotResult> = {}): StoredCopilotResult {
  return {
    interactionId: "interaction-1",
    analysis: makeAnalysis(),
    turnIndex: 0,
    maxTurns: 5,
    ...overrides,
  };
}

describe("useCopilotConversation — UX-08: rascunho de respostas sobrevive à navegação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useOnlineStatusMock.mockReturnValue({ isOnline: true });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("starts with no answers when there is no saved draft", () => {
    const { result } = renderHook(() => useCopilotConversation(ENCOUNTER_ID, makeInitial()));
    expect(result.current.answers).toEqual({});
  });

  it("persists a draft to sessionStorage as soon as an answer is set, before reanalyzing", () => {
    const { result } = renderHook(() => useCopilotConversation(ENCOUNTER_ID, makeInitial()));

    act(() => {
      result.current.setAnswer("q-pa", "PA 90x60, FC 130, FR 28, SpO2 89%");
    });

    const raw = sessionStorage.getItem(DRAFT_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.interactionId).toBe("interaction-1");
    expect(parsed.answers).toEqual({ "q-pa": "PA 90x60, FC 130, FR 28, SpO2 89%" });
  });

  it("restores the draft answer when the hook remounts for the same turn (simulates leaving and returning to the encounter)", () => {
    const first = renderHook(() => useCopilotConversation(ENCOUNTER_ID, makeInitial()));
    act(() => {
      first.result.current.setAnswer("q-pa", "PA 90x60, FC 130, FR 28, SpO2 89%");
    });
    // UX-08 — o bug relatado: sair da tela (desmontar) e voltar (montar de
    // novo) sem nunca ter clicado em "Reanalisar".
    first.unmount();

    const second = renderHook(() => useCopilotConversation(ENCOUNTER_ID, makeInitial()));
    expect(second.result.current.answers).toEqual({
      "q-pa": "PA 90x60, FC 130, FR 28, SpO2 89%",
    });
  });

  it("does NOT restore a draft that belongs to a different (older) turn", () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        interactionId: "interaction-OLD",
        answers: { "q-pa": "resposta de um turno que já não existe" },
      }),
    );

    const { result } = renderHook(() =>
      useCopilotConversation(ENCOUNTER_ID, makeInitial({ interactionId: "interaction-NEW" })),
    );

    expect(result.current.answers).toEqual({});
  });

  it("clears the draft once the answers are successfully submitted via reanalyze", async () => {
    const respondResult: CopilotAnalyzeResponse = {
      interactionId: "interaction-2",
      output: makeAnalysis({ clarifyingQuestions: [], uncertainty: false, uncertaintyReason: null }),
      citations: [],
      metadata: {
        piiDetected: false,
        injectionDetected: false,
        chunksRetrieved: 3,
        latencyMs: 800,
        cost: 0.01,
        model: "test-model",
        turnIndex: 1,
        maxTurns: 5,
      },
    };
    apiPostMock.mockResolvedValue(respondResult);

    const { result } = renderHook(() => useCopilotConversation(ENCOUNTER_ID, makeInitial()));
    act(() => {
      result.current.setAnswer("q-pa", "PA 90x60, FC 130, FR 28, SpO2 89%");
    });
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();

    await act(async () => {
      await result.current.reanalyze();
    });

    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    // O resultado do novo turno também é persistido — canal separado do rascunho.
    expect(sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${ENCOUNTER_ID}`)).not.toBeNull();
  });

  it("keeps the draft in place when reanalyze fails, so the physician's answer is not lost on a network error either", async () => {
    apiPostMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useCopilotConversation(ENCOUNTER_ID, makeInitial()));
    act(() => {
      result.current.setAnswer("q-pa", "PA 90x60, FC 130, FR 28, SpO2 89%");
    });

    await act(async () => {
      await result.current.reanalyze();
    });

    expect(result.current.respondError).toBeTruthy();
    const raw = sessionStorage.getItem(DRAFT_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).answers).toEqual({ "q-pa": "PA 90x60, FC 130, FR 28, SpO2 89%" });
  });
});

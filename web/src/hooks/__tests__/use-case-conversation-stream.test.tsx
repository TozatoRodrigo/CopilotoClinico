import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  CaseConversationResponse,
  CaseUnderstanding,
  ConversationTurn,
} from "@/lib/types";
import { sseResponse, type SseResponse } from "@/test/sse-response";

/**
 * Reanálise por streaming na conversa do caso, com o useCopilotStream de
 * verdade e um fetch controlável (POST /copilot/respond/stream, resposta
 * text/event-stream) — use-case-conversation.test.tsx cobre o resto da
 * conversa com o stream simulado.
 */

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const fetchMock = vi.fn();
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

const ENCOUNTER_ID = "enc-guiado-stream";

function understandingOf(problemRepresentation: string): CaseUnderstanding {
  return {
    problemRepresentation,
    structuredData: {
      age: 34,
      sex: "F",
      vitals: {
        systolicBp: null,
        diastolicBp: null,
        heartRate: null,
        respiratoryRate: null,
        spo2: null,
        temperature: null,
        glucose: null,
      },
      onset: null,
      keyFindings: [],
      relevantContext: [],
    },
    instability: { present: false, findings: [] },
    syndrome: "cefaleia",
    syndromeNote: null,
    cannotMiss: [],
    likely: [],
    missingDiscriminators: [],
    searchQueries: ["cefaleia com febre"],
    timeCritical: true,
  };
}

const newUnderstanding = understandingOf("Mulher, 34 anos, cefaleia com febre.");

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    interactionId: "interaction-1",
    caseText: "Mulher, 34 anos, cefaleia forte desde ontem.",
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

const rebuiltTurn = turn({
  interactionId: "interaction-2",
  turnIndex: 1,
  output: {
    reasoning: "Cefaleia com febre: punção depois da TC.",
    redFlags: [],
    recommendations: [],
    differentials: [],
    clarifyingQuestions: [],
  },
});

function conversation(turns: ConversationTurn[]): CaseConversationResponse {
  return { intake: null, turns, maxTurns: 5 };
}

const complement = "Febre de 38,5 °C desde a manhã";
const complementAnswers = [
  { questionId: "Informações adicionais fornecidas pelo médico", answer: complement },
];

function renderConversation() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCaseConversation(ENCOUNTER_ID), { wrapper });
}

/** Plano na tela, complemento enviado: espera o POST do stream sair. */
async function startRebuild(result: { current: ReturnType<typeof useCaseConversation> }) {
  await waitFor(() => expect(result.current.phase).toBe("plan"));
  act(() => result.current.complementCase(complement));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
}

function streamRespondsWith(stream: SseResponse) {
  fetchMock.mockResolvedValue(stream.response);
  return stream;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  sessionStorage.clear();
  online = true;
  vi.stubGlobal("fetch", fetchMock);
  apiGetMock.mockResolvedValue(conversation([turn()]));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCaseConversation — reanálise por streaming", () => {
  it("streams the rebuild: the new understanding first, then the new round from the server", async () => {
    const stream = streamRespondsWith(sseResponse());
    const { result } = renderConversation();
    await startRebuild(result);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/encounters/${ENCOUNTER_ID}/copilot/respond/stream$`));
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      interactionId: "interaction-1",
      answers: complementAnswers,
    });
    expect(result.current.rebuilding).toBe(true);
    expect(result.current.rebuildUnderstanding).toBeNull();

    act(() => {
      stream.raw(": stream aberto\n\n");
      stream.event({ type: "understanding", understanding: newUnderstanding });
    });
    await waitFor(() => expect(result.current.rebuildUnderstanding).toEqual(newUnderstanding));
    // A rodada anterior fica na tela até a nova chegar.
    expect(result.current.turns.map((item) => item.interactionId)).toEqual(["interaction-1"]);

    apiGetMock.mockResolvedValue(conversation([turn(), rebuiltTurn]));
    act(() => {
      stream.event({ type: "delta", delta: '{"reasoning":' });
      stream.event({ type: "done", result: { interactionId: "interaction-2" } });
    });

    await waitFor(() => expect(result.current.rebuilding).toBe(false));
    expect(result.current.turns.map((item) => item.interactionId)).toEqual([
      "interaction-1",
      "interaction-2",
    ]);
    expect(result.current.rebuildUnderstanding).toBeNull();
    expect(result.current.respondError).toBeNull();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the network fails", () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))],
    ["the session expired (401)", () => streamRespondsWith(sseResponse(401))],
    ["the server refuses (500)", () => streamRespondsWith(sseResponse(500))],
  ])("falls back to the POST once when %s before the stream opens", async (_label, arrange) => {
    arrange();
    apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
    apiGetMock.mockResolvedValue(conversation([turn()]));
    const { result } = renderConversation();
    await waitFor(() => expect(result.current.phase).toBe("plan"));
    apiGetMock.mockResolvedValue(conversation([turn(), rebuiltTurn]));

    act(() => result.current.complementCase(complement));

    await waitFor(() => expect(result.current.turns).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
      interactionId: "interaction-1",
      answers: complementAnswers,
    });
  });

  it("shows the POST error when the fallback fails too, without trying a third time", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    apiPostMock.mockRejectedValue(new Error("Input contains potentially unsafe content"));
    const { result } = renderConversation();
    await startRebuild(result);

    await waitFor(() =>
      expect(result.current.respondError).toBe("Input contains potentially unsafe content"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  // Os cabeçalhos 2xx chegaram: o servidor já está na Etapa 1 (~20 s sem
  // evento). Se a rede cai aí, refazer pelo POST gravaria uma segunda análise.
  it.each([
    ["the 2xx headers arrived", () => {}],
    [
      "the understanding arrived",
      (stream: SseResponse) => stream.event({ type: "understanding", understanding: newUnderstanding }),
    ],
    ["a delta arrived", (stream: SseResponse) => stream.event({ type: "delta", delta: "{" })],
  ])("never resends once %s: the dropped connection shows the error", async (_label, first) => {
    const stream = streamRespondsWith(sseResponse());
    const { result } = renderConversation();
    await startRebuild(result);

    act(() => {
      first(stream);
      stream.drop();
    });

    await waitFor(() => expect(result.current.respondError).toBe("Conexão de streaming perdida."));
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.rebuilding).toBe(false);
    expect(result.current.turns.map((item) => item.interactionId)).toEqual(["interaction-1"]);
  });

  it("never resends when the server reports a failed analysis (the failure is already recorded)", async () => {
    const stream = streamRespondsWith(sseResponse());
    const { result } = renderConversation();
    await startRebuild(result);

    act(() => stream.event({ type: "error", errors: ["Output is not valid JSON"] }));

    await waitFor(() => expect(result.current.respondError).toBe("Output is not valid JSON"));
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("goes straight to the POST when fetch cannot stream a body", async () => {
    vi.stubGlobal("ReadableStream", undefined);
    apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
    const { result } = renderConversation();
    await waitFor(() => expect(result.current.phase).toBe("plan"));

    act(() => result.current.complementCase(complement));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
        interactionId: "interaction-1",
        answers: complementAnswers,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still queues the answers when there is no connection", async () => {
    online = false;
    const { result } = renderConversation();
    await waitFor(() => expect(result.current.phase).toBe("plan"));

    act(() => result.current.complementCase(complement));

    await waitFor(() =>
      expect(addToQueueMock).toHaveBeenCalledWith({
        type: "respond",
        encounterId: ENCOUNTER_ID,
        interactionId: "interaction-1",
        answers: complementAnswers,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});

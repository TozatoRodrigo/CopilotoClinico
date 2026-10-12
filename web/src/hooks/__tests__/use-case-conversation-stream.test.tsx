import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  CaseConversationResponse,
  CaseUnderstanding,
  ConversationTurn,
} from "@/lib/types";

/**
 * Reanálise por streaming na conversa do caso, com o useCopilotStream de
 * verdade e um EventSource controlável — use-case-conversation.test.tsx
 * cobre o resto da conversa com o stream simulado.
 */

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
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
const { MAX_RESPOND_STREAM_ANSWERS_LENGTH } = await import("@/lib/copilot-stream");

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitError() {
    this.onerror?.();
  }
}

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

/** Plano na tela, complemento enviado: devolve o EventSource da reanálise. */
async function startRebuild(result: { current: ReturnType<typeof useCaseConversation> }) {
  await waitFor(() => expect(result.current.phase).toBe("plan"));
  act(() => result.current.complementCase(complement));
  await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
  return MockEventSource.instances[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  online = true;
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  apiGetMock.mockResolvedValue(conversation([turn()]));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCaseConversation — reanálise por streaming", () => {
  it("streams the rebuild: the new understanding first, then the new round from the server", async () => {
    const { result } = renderConversation();
    const es = await startRebuild(result);

    const url = new URL(es.url);
    expect(url.pathname).toMatch(new RegExp(`/encounters/${ENCOUNTER_ID}/copilot/respond/stream$`));
    expect(url.searchParams.get("interactionId")).toBe("interaction-1");
    expect(JSON.parse(url.searchParams.get("answers") ?? "null")).toEqual(complementAnswers);
    expect(result.current.rebuilding).toBe(true);
    expect(result.current.rebuildUnderstanding).toBeNull();

    act(() => {
      es.emitOpen();
      es.emitMessage({ type: "understanding", understanding: newUnderstanding });
    });
    expect(result.current.rebuildUnderstanding).toEqual(newUnderstanding);
    // A rodada anterior fica na tela até a nova chegar.
    expect(result.current.turns.map((item) => item.interactionId)).toEqual(["interaction-1"]);

    apiGetMock.mockResolvedValue(conversation([turn(), rebuiltTurn]));
    act(() => {
      es.emitMessage({ type: "delta", delta: '{"reasoning":' });
      es.emitMessage({ type: "done", result: { interactionId: "interaction-2" } });
    });

    await waitFor(() => expect(result.current.rebuilding).toBe(false));
    expect(result.current.turns.map((item) => item.interactionId)).toEqual([
      "interaction-1",
      "interaction-2",
    ]);
    expect(result.current.rebuildUnderstanding).toBeNull();
    expect(result.current.respondError).toBeNull();
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(es.closed).toBe(true);
  });

  it("falls back to the POST once when the connection never opened", async () => {
    apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
    const { result } = renderConversation();
    const es = await startRebuild(result);

    apiGetMock.mockResolvedValue(conversation([turn(), rebuiltTurn]));
    act(() => es.emitError());

    await waitFor(() => expect(result.current.rebuilding).toBe(false));
    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
      interactionId: "interaction-1",
      answers: complementAnswers,
    });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(result.current.turns).toHaveLength(2);
  });

  it("shows the POST error when the fallback fails too, without trying a third time", async () => {
    apiPostMock.mockRejectedValue(new Error("Input contains potentially unsafe content"));
    const { result } = renderConversation();
    const es = await startRebuild(result);

    act(() => es.emitError());

    await waitFor(() =>
      expect(result.current.respondError).toBe("Input contains potentially unsafe content"),
    );
    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances).toHaveLength(1);
  });

  // A conexão abriu: o servidor já está na Etapa 1 (~20 s sem frame). Se a
  // rede cai aí, refazer pelo POST gravaria uma segunda análise.
  it.each([
    ["the connection opened", (es: MockEventSource) => es.emitOpen()],
    [
      "the understanding arrived",
      (es: MockEventSource) => es.emitMessage({ type: "understanding", understanding: newUnderstanding }),
    ],
    ["a delta arrived", (es: MockEventSource) => es.emitMessage({ type: "delta", delta: "{" })],
  ])("never resends once %s: the dropped connection shows the error", async (_label, first) => {
    const { result } = renderConversation();
    const es = await startRebuild(result);

    act(() => {
      first(es);
      es.emitError();
    });

    await waitFor(() => expect(result.current.respondError).toBe("Conexão de streaming perdida."));
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(1);
    expect(result.current.rebuilding).toBe(false);
    expect(result.current.turns.map((item) => item.interactionId)).toEqual(["interaction-1"]);
  });

  it("never resends when the server reports a failed analysis (the failure is already recorded)", async () => {
    const { result } = renderConversation();
    const es = await startRebuild(result);

    act(() => {
      es.emitOpen();
      es.emitMessage({ type: "error", errors: ["Output is not valid JSON"] });
    });

    await waitFor(() => expect(result.current.respondError).toBe("Output is not valid JSON"));
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("sends answers above the URL ceiling straight through the POST", async () => {
    apiPostMock.mockResolvedValue({ interactionId: "interaction-2" });
    const { result } = renderConversation();
    await waitFor(() => expect(result.current.phase).toBe("plan"));
    const longText = "a".repeat(MAX_RESPOND_STREAM_ANSWERS_LENGTH);

    act(() => result.current.complementCase(longText));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}/copilot/respond`, {
        interactionId: "interaction-1",
        answers: [{ questionId: "Informações adicionais fornecidas pelo médico", answer: longText }],
      }),
    );
    expect(MockEventSource.instances).toHaveLength(0);
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
    expect(MockEventSource.instances).toHaveLength(0);
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});

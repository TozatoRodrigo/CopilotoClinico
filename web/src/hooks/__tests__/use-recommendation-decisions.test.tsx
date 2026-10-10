import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  NOTE_SYNC_DELAY_MS,
  decisionAfterClick,
  decisionAfterNote,
  pendingStorageKey,
  useRecommendationDecisions,
  type RecommendationDecisionState,
} from "../use-recommendation-decisions";
import type { RecommendationDecisionRecord } from "@/lib/types";

const apiGetMock = vi.fn();
const apiPutMock = vi.fn();
const captureExceptionMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => apiGetMock(...args),
      put: (...args: unknown[]) => apiPutMock(...args),
    },
  };
});

vi.mock("@/lib/sentry", () => ({
  Sentry: { captureException: (...args: unknown[]) => captureExceptionMock(...args) },
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

const { ApiError } = await import("@/lib/api-client");

// O fallback offline guarda pendências num cache de módulo por
// (encontro, análise): cada teste usa um encontro próprio.
let encounterSeq = 0;
function nextEncounterId(): string {
  encounterSeq += 1;
  return `enc-f0d-${encounterSeq}`;
}

const INTERACTION_ID = "interaction-1";

function record(
  overrides: Partial<RecommendationDecisionRecord> = {},
): RecommendationDecisionRecord {
  return {
    id: "decision-1",
    interactionId: INTERACTION_ID,
    recommendationIndex: 0,
    recommendationKey: "0-abcdef123456",
    decision: "adopted",
    note: null,
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
    ...overrides,
  };
}

/** Responde ao PUT ecoando o corpo, como o servidor faz. */
function echoPut(_path: string, body: { recommendationIndex: number; decision: string; note: string | null }) {
  return Promise.resolve(
    record({
      recommendationIndex: body.recommendationIndex,
      recommendationKey: `${body.recommendationIndex}-abcdef123456`,
      decision: body.decision as RecommendationDecisionRecord["decision"],
      note: body.note,
      updatedAt: new Date().toISOString(),
    }),
  );
}

function renderDecisions(encounterId: string, interactionId = INTERACTION_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(
    ({ id }: { id: string }) => useRecommendationDecisions(encounterId, id, 3),
    { wrapper: Wrapper, initialProps: { id: interactionId } },
  );
}

const adopted: RecommendationDecisionState = { decision: "adopted", decidedAt: "t" };
const modified: RecommendationDecisionState = { decision: "modified", note: "Dose menor", decidedAt: "t" };
const rejected: RecommendationDecisionState = { decision: "rejected", decidedAt: "t" };

describe("F0-D — mapeamento Adotar/Rejeitar/Anotar → enum do servidor", () => {
  it.each([
    ["Adotar sem decisão prévia", "adopted", undefined, "adopted"],
    ["Adotar com nota já escrita", "adopted", { ...rejected, note: "Dose menor" }, "modified"],
    ["Adotar uma rejeitada sem nota", "adopted", rejected, "adopted"],
    ["Rejeitar uma adotada com ajuste", "rejected", modified, "rejected"],
    ["Rejeitar sem decisão prévia", "rejected", undefined, "rejected"],
  ] as const)("%s → %s", (_label, click, current, expected) => {
    expect(decisionAfterClick(click, current)).toBe(expected);
  });

  it.each([
    ["nota numa adotada", "Dose menor", adopted, "modified"],
    ["nota sem decisão prévia (conta como adoção com ajuste)", "Dose menor", undefined, "modified"],
    ["nota numa rejeitada (vira o motivo)", "Alergia a AAS", rejected, "rejected"],
    ["apagar a nota de uma ajustada", "", modified, "adopted"],
    ["nota só com espaços", "   ", adopted, "adopted"],
  ] as const)("%s → %s", (_label, note, current, expected) => {
    expect(decisionAfterNote(note, current)).toBe(expected);
  });
});

describe("useRecommendationDecisions — F0-D: decisões no servidor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiGetMock.mockResolvedValue([]);
    apiPutMock.mockImplementation(echoPut);
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("loads the saved decisions of the analysis, keyed by recommendation index", async () => {
    const encounterId = nextEncounterId();
    apiGetMock.mockResolvedValue([record({ recommendationIndex: 2, decision: "rejected", note: "Sem indicação" })]);

    const { result } = renderDecisions(encounterId);

    await waitFor(() => expect(result.current.decisions["2"]?.decision).toBe("rejected"));
    expect(result.current.decisions["2"]?.note).toBe("Sem indicação");
    expect(apiGetMock).toHaveBeenCalledWith(`/encounters/${encounterId}/copilot/decisions`, {
      interactionId: INTERACTION_ID,
    });
    expect(result.current.counts).toEqual({ adopted: 0, modified: 0, rejected: 1, pending: 2 });
  });

  it("shows Adotar immediately (optimistic) and persists it on the server", async () => {
    const encounterId = nextEncounterId();
    let resolvePut: (value: RecommendationDecisionRecord) => void = () => undefined;
    apiPutMock.mockImplementation(() => new Promise((resolve) => (resolvePut = resolve)));
    const { result } = renderDecisions(encounterId);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

    act(() => result.current.setDecision("1", "adopted"));

    expect(result.current.decisions["1"]?.decision).toBe("adopted");
    expect(result.current.syncStatus).toBe("saving");
    await waitFor(() =>
      expect(apiPutMock).toHaveBeenCalledWith(`/encounters/${encounterId}/copilot/decisions`, {
        interactionId: INTERACTION_ID,
        recommendationIndex: 1,
        decision: "adopted",
        note: null,
      }),
    );

    await act(async () => resolvePut(record({ recommendationIndex: 1 })));

    expect(result.current.syncStatus).toBe("saved");
    expect(result.current.decisions["1"]?.decision).toBe("adopted");
    expect(sessionStorage.getItem(pendingStorageKey(encounterId, INTERACTION_ID))).toBeNull();
  });

  it("sends a note once the physician stops typing, as an adoption with adjustment", async () => {
    const encounterId = nextEncounterId();
    const { result } = renderDecisions(encounterId);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

    vi.useFakeTimers();
    act(() => result.current.setNote("0", "D"));
    act(() => result.current.setNote("0", "Do"));
    act(() => result.current.setNote("0", "Dose menor"));

    expect(result.current.decisions["0"]).toMatchObject({ decision: "modified", note: "Dose menor" });
    expect(apiPutMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(NOTE_SYNC_DELAY_MS);
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(`/encounters/${encounterId}/copilot/decisions`, {
      interactionId: INTERACTION_ID,
      recommendationIndex: 0,
      decision: "modified",
      note: "Dose menor",
    });
  });

  describe("fallback offline (sessionStorage)", () => {
    it("keeps the decision on this device when the network fails, and resends when the connection returns", async () => {
      const encounterId = nextEncounterId();
      apiPutMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const { result } = renderDecisions(encounterId);
      await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

      act(() => result.current.setDecision("2", "rejected"));

      await waitFor(() => expect(result.current.syncStatus).toBe("offline"));
      expect(result.current.decisions["2"]?.decision).toBe("rejected");
      const stored = JSON.parse(
        sessionStorage.getItem(pendingStorageKey(encounterId, INTERACTION_ID)) ?? "{}",
      ) as Record<string, RecommendationDecisionState>;
      expect(stored["2"]?.decision).toBe("rejected");

      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
      expect(apiPutMock).toHaveBeenCalledTimes(2);
      expect(sessionStorage.getItem(pendingStorageKey(encounterId, INTERACTION_ID))).toBeNull();
    });

    it("resends decisions left on this device by a previous visit", async () => {
      const encounterId = nextEncounterId();
      const leftover: Record<string, RecommendationDecisionState> = {
        "1": { decision: "modified", note: "Dose menor", decidedAt: "2026-10-10T09:00:00.000Z" },
      };
      sessionStorage.setItem(pendingStorageKey(encounterId, INTERACTION_ID), JSON.stringify(leftover));

      const { result } = renderDecisions(encounterId);

      expect(result.current.decisions["1"]?.decision).toBe("modified");
      await waitFor(() =>
        expect(apiPutMock).toHaveBeenCalledWith(`/encounters/${encounterId}/copilot/decisions`, {
          interactionId: INTERACTION_ID,
          recommendationIndex: 1,
          decision: "modified",
          note: "Dose menor",
        }),
      );
      await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
    });

    it("drops a decision the server refuses (4xx), reports it and warns the physician", async () => {
      const encounterId = nextEncounterId();
      apiPutMock.mockRejectedValueOnce(new ApiError(404, "Analysis not found for this encounter"));
      const { result } = renderDecisions(encounterId);
      await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

      act(() => result.current.setDecision("0", "adopted"));

      await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
      expect(captureExceptionMock).toHaveBeenCalled();
      expect(result.current.decisions["0"]).toBeUndefined();
      expect(result.current.syncStatus).toBe("saved");
    });
  });

  it("never shows a decision of the previous analysis on the recommendations of a new one", async () => {
    const encounterId = nextEncounterId();
    apiGetMock.mockImplementation((_path: string, params: { interactionId: string }) =>
      Promise.resolve(params.interactionId === INTERACTION_ID ? [record({ decision: "rejected" })] : []),
    );
    const { result, rerender } = renderDecisions(encounterId);
    await waitFor(() => expect(result.current.decisions["0"]?.decision).toBe("rejected"));

    rerender({ id: "interaction-2" });

    await waitFor(() =>
      expect(apiGetMock).toHaveBeenCalledWith(`/encounters/${encounterId}/copilot/decisions`, {
        interactionId: "interaction-2",
      }),
    );
    expect(result.current.decisions["0"]).toBeUndefined();
  });
});

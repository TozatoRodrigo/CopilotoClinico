import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCopilotStream } from "../use-copilot-stream";
import { CopilotStreamError } from "@/lib/copilot-stream";
import { sseResponse, type SseResponse } from "@/test/sse-response";
import type { CaseUnderstanding } from "@/lib/types";

/**
 * Reanálise por POST /copilot/respond/stream: as respostas vão no corpo,
 * nunca na URL (ADR-014), e a resposta text/event-stream é lida pelo fetch.
 */

const fetchMock = vi.fn();

const answers = [
  { questionId: "q-glicemia", answer: "Glicemia 112, sem déficit" },
  { questionId: "q-peso", answer: 70 },
];

const understanding = {
  problemRepresentation: "Mulher, 34 anos, cefaleia com febre.",
} as unknown as CaseUnderstanding;

const doneResult = { interactionId: "interaction-2" };

function renderStream() {
  return renderHook(() => useCopilotStream("enc-001"));
}

/** Dispara a reanálise e devolve a promessa já com o desfecho capturado. */
function start(result: { current: ReturnType<typeof useCopilotStream> }) {
  const settled: { value?: unknown; error?: unknown } = {};
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = result.current.startRespond("interaction-1", answers).then(
      (value) => {
        settled.value = value;
      },
      (error: unknown) => {
        settled.error = error;
      },
    );
  });
  return { settled, pending };
}

async function failureAfter(
  stream: SseResponse,
  drive: (stream: SseResponse) => void,
): Promise<CopilotStreamError> {
  fetchMock.mockResolvedValue(stream.response);
  const { result } = renderStream();
  const { settled, pending } = start(result);
  await act(async () => {
    drive(stream);
    await pending;
  });
  expect(result.current.status).toBe("error");
  expect(settled.error).toBeInstanceOf(CopilotStreamError);
  return settled.error as CopilotStreamError;
}

describe("useCopilotStream — reanálise por POST", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the answers in the body with credentials, never in the URL", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderStream();

    start(result);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/encounters\/enc-001\/copilot\/respond\/stream$/);
    expect(url).not.toContain("?");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ interactionId: "interaction-1", answers });
    expect(result.current.status).toBe("streaming");
  });

  it("exposes the understanding and the deltas, then resolves with the done result", async () => {
    const stream = sseResponse();
    fetchMock.mockResolvedValue(stream.response);
    const { result } = renderStream();
    const { settled, pending } = start(result);

    await act(async () => {
      stream.raw(": stream aberto\n\n");
      stream.event({ type: "understanding", understanding });
    });
    expect(result.current.understanding).toEqual(understanding);

    await act(async () => {
      // Um delta partido entre dois chunks e o done no mesmo chunk do resto.
      stream.raw('data: {"type":"delta","del');
      stream.raw(`ta":"{"}\n\ndata: ${JSON.stringify({ type: "done", result: doneResult })}\n\n`);
      await pending;
    });

    expect(result.current.partialText).toBe("{");
    expect(result.current.status).toBe("done");
    expect(settled.value).toEqual(doneResult);
  });

  it("lets the caller retry with the POST when fetch fails before any response", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderStream();
    const { settled, pending } = start(result);
    await act(async () => {
      await pending;
    });

    expect((settled.error as CopilotStreamError).neverOpened).toBe(true);
  });

  it.each([400, 401, 404, 500])(
    "lets the caller retry with the POST on a %i, before reading any byte of the body",
    async (status) => {
      const failure = await failureAfter(sseResponse(status), () => {});

      expect(failure.neverOpened).toBe(true);
    },
  );

  // Os cabeçalhos 2xx chegaram: o servidor já está na Etapa 1 (~20 s sem
  // evento). Se a rede cai aí, refazer pelo POST gravaria uma segunda análise.
  it("forbids the retry once the 2xx headers arrived, even before the first event", async () => {
    const failure = await failureAfter(sseResponse(), (stream) => stream.drop());

    expect(failure.message).toBe("Conexão de streaming perdida.");
    expect(failure.neverOpened).toBe(false);
  });

  it("forbids the retry when the body ends without done or error", async () => {
    const failure = await failureAfter(sseResponse(), (stream) => {
      stream.event({ type: "understanding", understanding });
      stream.close();
    });

    expect(failure.neverOpened).toBe(false);
  });

  it("treats the server error event as the answer, never as a lost connection", async () => {
    const failure = await failureAfter(sseResponse(), (stream) =>
      stream.event({ type: "error", errors: ["Output is not valid JSON"] }),
    );

    expect(failure.message).toBe("Output is not valid JSON");
    expect(failure.neverOpened).toBe(false);
  });

  it("stop() aborts the request", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderStream();
    start(result);
    const { signal } = fetchMock.mock.calls[0]![1] as RequestInit;

    act(() => result.current.stop());

    expect(signal?.aborted).toBe(true);
  });
});

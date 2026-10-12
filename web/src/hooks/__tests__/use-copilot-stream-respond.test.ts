import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCopilotStream } from "../use-copilot-stream";
import {
  CopilotStreamError,
  MAX_RESPOND_STREAM_ANSWERS_LENGTH,
  isRespondStreamEligible,
} from "@/lib/copilot-stream";

// EventSource não existe em jsdom — mock controlável, agora com `onopen`:
// a conexão aberta é o que separa "dá para refazer pelo POST" de "não dá".
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

  emitRaw(rawData: string) {
    this.onmessage?.({ data: rawData });
  }

  emitError() {
    this.onerror?.();
  }
}

function latestInstance(): MockEventSource {
  const instance = MockEventSource.instances.at(-1);
  if (!instance) throw new Error("Nenhuma instância de EventSource foi criada");
  return instance;
}

const answers = [
  { questionId: "q-glicemia", answer: "Glicemia 112, sem déficit; \"aspas\" & +mais" },
  { questionId: "q-peso", answer: 70 },
];

/** Abre a reanálise e devolve a rejeição (ou `null` se resolveu). */
async function failureOf(
  drive: (es: MockEventSource) => void,
): Promise<CopilotStreamError | null> {
  const { result } = renderHook(() => useCopilotStream("enc-001"));
  let failure: unknown = null;
  let pending: Promise<unknown> = Promise.resolve();
  act(() => {
    pending = result.current.startRespond("interaction-1", answers).catch((error: unknown) => {
      failure = error;
    });
  });
  const es = latestInstance();
  await act(async () => {
    drive(es);
    await pending;
  });
  expect(es.closed).toBe(true);
  return failure as CopilotStreamError | null;
}

describe("useCopilotStream — reanálise", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the respond stream with the interaction and the answers as JSON, using credentials", () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.startRespond("interaction-1", answers);
    });

    const es = latestInstance();
    expect(es.withCredentials).toBe(true);
    const url = new URL(es.url);
    expect(url.pathname).toMatch(/\/encounters\/enc-001\/copilot\/respond\/stream$/);
    expect(url.searchParams.get("interactionId")).toBe("interaction-1");
    // O texto volta exatamente igual: acento, aspas, & e + sobrevivem à URL.
    expect(JSON.parse(url.searchParams.get("answers") ?? "null")).toEqual(answers);
  });

  it("lets the caller retry with the POST when the connection never opened", async () => {
    const failure = await failureOf((es) => es.emitError());

    expect(failure).toBeInstanceOf(CopilotStreamError);
    expect(failure?.neverOpened).toBe(true);
  });

  // A conexão abriu: o servidor já está na Etapa 1 (~20 s sem frame). Se a
  // rede cai aí, refazer pelo POST gravaria uma segunda análise.
  it("forbids the retry once the connection opened, even before the first event", async () => {
    const failure = await failureOf((es) => {
      es.emitOpen();
      es.emitError();
    });

    expect(failure?.message).toBe("Conexão de streaming perdida.");
    expect(failure?.neverOpened).toBe(false);
  });

  it("forbids the retry after any frame, even a malformed one", async () => {
    const failure = await failureOf((es) => {
      es.emitRaw("{ not json");
      es.emitError();
    });

    expect(failure?.neverOpened).toBe(false);
  });

  it("treats the server error event as the answer, never as a lost connection", async () => {
    const failure = await failureOf((es) =>
      es.emitMessage({ type: "error", errors: ["Output is not valid JSON"] }),
    );

    expect(failure?.message).toBe("Output is not valid JSON");
    expect(failure?.neverOpened).toBe(false);
  });
});

describe("isRespondStreamEligible", () => {
  it("measures the JSON that goes in the query string, not only the answer text", () => {
    const answerOf = (length: number) => [{ questionId: "q1", answer: "a".repeat(length) }];
    const room = MAX_RESPOND_STREAM_ANSWERS_LENGTH - JSON.stringify(answerOf(0)).length;

    expect(isRespondStreamEligible(answerOf(room))).toBe(true);
    expect(isRespondStreamEligible(answerOf(room + 1))).toBe(false);
  });
});

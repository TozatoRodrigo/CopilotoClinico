import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCopilotStream, isStreamEligible } from "../use-copilot-stream";
import type { CopilotAnalyzeResponse, EncounterContext } from "@/lib/types";

// EventSource não existe em jsdom — mock controlável para disparar
// onmessage/onerror manualmente e inspecionar a URL construída.
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
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

const baseContext: EncounterContext = { hasCT: true, isSus: false, hasLab: true, hasICU: false };

const doneResult: CopilotAnalyzeResponse = {
  interactionId: "interaction-stream-001",
  output: {
    reasoning: "Quadro compatível com choque.",
    redFlags: [],
    recommendations: [],
    citations: [],
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
    latencyMs: 900,
    cost: 0.004,
    model: "claude-3-sonnet",
    turnIndex: 0,
    maxTurns: 5,
  },
};

function latestInstance(): MockEventSource {
  const instance = MockEventSource.instances.at(-1);
  if (!instance) throw new Error("Nenhuma instância de EventSource foi criada");
  return instance;
}

describe("isStreamEligible (UX-06)", () => {
  it("accepts case text within the safe URL-length threshold", () => {
    expect(isStreamEligible("Paciente com dor torácica.")).toBe(true);
  });

  it("rejects case text long enough to risk truncation as a GET query param", () => {
    expect(isStreamEligible("a".repeat(3001))).toBe(false);
  });

  it("accepts exactly at the boundary", () => {
    expect(isStreamEligible("a".repeat(3000))).toBe(true);
  });
});

describe("useCopilotStream (UX-06)", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the stream URL with case text, context and red-flag defaults, using credentials", () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.start({ caseText: "Dor torácica aguda", context: baseContext });
    });

    const es = latestInstance();
    expect(es.withCredentials).toBe(true);
    expect(es.url).toContain("/encounters/enc-001/copilot/stream?");
    expect(es.url).toContain("caseText=Dor+tor%C3%A1cica+aguda");
    expect(es.url).toContain("hasCT=true");
    expect(es.url).toContain("isSus=false");
    // UX-06 — paridade de red flags: mesmo sem marcar nenhuma, os 6
    // parâmetros vão explicitamente como false (não omitidos).
    for (const key of ["immunosuppressed", "pregnant", "anticoagulant", "pediatric", "elderly65", "allergy"]) {
      expect(es.url).toContain(`${key}=false`);
    }
  });

  it("forwards physician-confirmed red flags in the query string", () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.start({
        caseText: "Paciente gestante com dor abdominal",
        context: baseContext,
        redFlags: { pregnant: true, anticoagulant: true },
      });
    });

    const es = latestInstance();
    expect(es.url).toContain("pregnant=true");
    expect(es.url).toContain("anticoagulant=true");
    expect(es.url).toContain("immunosuppressed=false");
  });

  it("accumulates delta events into partialText as a live signal (not shown as structured content)", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.start({ caseText: "Caso clínico", context: baseContext });
    });
    const es = latestInstance();

    act(() => {
      es.emitMessage({ type: "delta", delta: '{"reasoning":' });
      es.emitMessage({ type: "delta", delta: ' "Quadro' });
    });

    await waitFor(() => {
      expect(result.current.partialText).toBe('{"reasoning": "Quadro');
    });
    expect(result.current.status).toBe("streaming");
  });

  it("resolves with the validated result and sets status=done on the done event", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    let resolved: CopilotAnalyzeResponse | undefined;
    act(() => {
      void result.current.start({ caseText: "Caso clínico", context: baseContext }).then((r) => {
        resolved = r;
      });
    });
    const es = latestInstance();

    act(() => {
      es.emitMessage({ type: "done", result: doneResult });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("done");
    });
    expect(resolved).toEqual(doneResult);
    expect(es.closed).toBe(true);
  });

  it("rejects when the backend emits a type='error' event", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    let caught: Error | undefined;
    act(() => {
      void result.current
        .start({ caseText: "Caso clínico", context: baseContext })
        .catch((err: Error) => {
          caught = err;
        });
    });
    const es = latestInstance();

    act(() => {
      es.emitMessage({ type: "error", errors: ["DEAD END: ..."] });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(caught?.message).toContain("DEAD END");
    expect(es.closed).toBe(true);
  });

  it("rejects on a real connection failure (onerror before any terminal event)", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    let caught: Error | undefined;
    act(() => {
      void result.current
        .start({ caseText: "Caso clínico", context: baseContext })
        .catch((err: Error) => {
          caught = err;
        });
    });
    const es = latestInstance();

    act(() => {
      es.emitError();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(caught).toBeInstanceOf(Error);
    expect(es.closed).toBe(true);
  });

  // UX-06 — decisão deliberada de reiniciar, não retomar: onerror após um
  // done já resolvido não pode gerar uma segunda rejeição/crash. O
  // EventSource nativo dispara onerror tanto para falhas reais quanto para
  // o fechamento normal da conexão pelo servidor após o done.
  it("ignores a late onerror that fires after the stream already completed successfully", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    let settledTwice = false;
    act(() => {
      void result.current
        .start({ caseText: "Caso clínico", context: baseContext })
        .then(() => {
          if (settledTwice) throw new Error("promise resolved twice");
        })
        .catch(() => {
          settledTwice = true;
        });
    });
    const es = latestInstance();

    act(() => {
      es.emitMessage({ type: "done", result: doneResult });
    });
    await waitFor(() => expect(result.current.status).toBe("done"));

    // onerror tardio, depois do done — não deve mudar o status nem
    // rejeitar uma promise já resolvida.
    act(() => {
      es.emitError();
    });

    expect(result.current.status).toBe("done");
    expect(settledTwice).toBe(false);
  });

  it("ignores a single malformed JSON frame instead of crashing the whole stream", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.start({ caseText: "Caso clínico", context: baseContext });
    });
    const es = latestInstance();

    act(() => {
      es.emitRaw("{ not valid json");
      es.emitMessage({ type: "delta", delta: "continua normalmente" });
    });

    await waitFor(() => {
      expect(result.current.partialText).toBe("continua normalmente");
    });
    expect(result.current.status).toBe("streaming");
  });

  it("stop() closes the underlying EventSource", () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.start({ caseText: "Caso clínico", context: baseContext });
    });
    const es = latestInstance();
    expect(es.closed).toBe(false);

    act(() => {
      result.current.stop();
    });
    expect(es.closed).toBe(true);
  });
});

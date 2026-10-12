import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCopilotStream } from "../use-copilot-stream";
import type { CopilotAnalyzeResponse } from "@/lib/types";

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

const INTAKE_ID = "00000000-0000-4000-8000-000000000001";

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
    retrievalCoverage: "full" as const,
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

describe("useCopilotStream (UX-06)", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the plan stream with only the conversation id in the URL, using credentials", () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.startFromIntake(INTAKE_ID);
    });

    const es = latestInstance();
    expect(es.withCredentials).toBe(true);
    // ADR-014 — o caso e as respostas já estão no servidor: nada clínico na URL.
    expect(es.url).toMatch(new RegExp(`/encounters/enc-001/copilot/intake/${INTAKE_ID}/stream$`));
    expect(es.url).not.toContain("?");
  });

  it("accumulates delta events into partialText as a live signal (not shown as structured content)", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    act(() => {
      void result.current.startFromIntake(INTAKE_ID);
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

  // F1 — com o raciocínio em etapas, o entendimento do caso chega antes dos
  // deltas: é estrutura já validada no servidor, pode ir para a tela.
  it("exposes the understanding event as soon as it arrives, before the plan", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));
    const understanding = {
      problemRepresentation: "Homem de 68 anos com déficit focal súbito.",
      structuredData: {
        age: 68,
        sex: "M" as const,
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
      syndrome: "deficit-neurologico-focal" as const,
      syndromeNote: null,
      cannotMiss: [],
      likely: [],
      missingDiscriminators: [],
      searchQueries: ["manejo inicial do AVC"],
    };

    act(() => {
      void result.current.startFromIntake(INTAKE_ID);
    });
    expect(result.current.understanding).toBeNull();
    const es = latestInstance();

    act(() => {
      es.emitMessage({ type: "understanding", understanding });
    });

    await waitFor(() => {
      expect(result.current.understanding).toEqual(understanding);
    });
    expect(result.current.status).toBe("streaming");
    expect(result.current.partialText).toBe("");
    expect(es.closed).toBe(false);
  });

  it("resolves with the validated result and sets status=done on the done event", async () => {
    const { result } = renderHook(() => useCopilotStream("enc-001"));

    let resolved: CopilotAnalyzeResponse | undefined;
    act(() => {
      void result.current.startFromIntake(INTAKE_ID).then((r) => {
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
        .startFromIntake(INTAKE_ID)
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
        .startFromIntake(INTAKE_ID)
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
        .startFromIntake(INTAKE_ID)
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
      void result.current.startFromIntake(INTAKE_ID);
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
      void result.current.startFromIntake(INTAKE_ID);
    });
    const es = latestInstance();
    expect(es.closed).toBe(false);

    act(() => {
      result.current.stop();
    });
    expect(es.closed).toBe(true);
  });
});

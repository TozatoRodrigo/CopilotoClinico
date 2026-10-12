/**
 * Resposta de fetch com corpo text/event-stream controlado pelo teste: os
 * bytes chegam quando o teste manda, em pedaços quaisquer, como na rede.
 * Só o que use-copilot-stream.ts lê de um Response (`ok`, `status`, `body`).
 */
export function sseResponse(status = 200) {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });
  const push = (bytes: Uint8Array) => controller?.enqueue(bytes);

  return {
    response: { ok: status >= 200 && status < 300, status, body } as unknown as Response,
    /** Um evento inteiro, no formato do servidor. */
    event(data: unknown) {
      push(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    },
    /** Texto cru, para partir um evento entre chunks. */
    raw(text: string) {
      push(encoder.encode(text));
    },
    bytes(chunk: Uint8Array) {
      push(chunk);
    },
    close() {
      controller?.close();
    },
    /** A conexão cai no meio do corpo. */
    drop() {
      controller?.error(new TypeError("network error"));
    },
  };
}

export type SseResponse = ReturnType<typeof sseResponse>;

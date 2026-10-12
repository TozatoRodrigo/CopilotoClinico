/**
 * Streaming da reanálise sem React: o parser de text/event-stream para o
 * corpo de um fetch (POST /copilot/respond/stream — EventSource só faz GET, e
 * as respostas do médico não vão na URL, ADR-014) e o erro que diz se ainda
 * dá para cair no POST /respond sem duplicar a análise. Ver
 * use-copilot-stream.ts.
 */

/**
 * Falha do streaming. `neverOpened` só é verdadeiro quando a conexão nunca
 * abriu (rede, proxy, status diferente de 2xx): o servidor não começou a
 * análise, e quem chamou pode refazer pelo POST. Depois dos cabeçalhos 2xx o
 * servidor já está analisando — mesmo sem nenhum evento ainda, durante os
 * ~20 s da Etapa 1 — e refazer gravaria uma segunda análise. Um `error` do
 * servidor é a resposta dele (a falha já foi gravada), não falta de conexão.
 */
export class CopilotStreamError extends Error {
  readonly neverOpened: boolean;

  constructor(message: string, neverOpened: boolean) {
    super(message);
    this.name = "CopilotStreamError";
    this.neverOpened = neverOpened;
  }
}

/** fetch com corpo em stream; sem ele, a reanálise vai direto pelo POST. */
export function canStreamFetch(): boolean {
  return (
    typeof fetch === "function" &&
    typeof ReadableStream === "function" &&
    typeof TextDecoder === "function"
  );
}

/** Fim de um evento: uma linha em branco (com LF ou CRLF). */
const EVENT_END = /\r?\n\r?\n/;

/** O `data` de um evento (várias linhas `data:` viram uma, com \n); `null` sem nenhuma. */
function dataOf(block: string): string | null {
  const lines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""));
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Parser mínimo de text/event-stream. Recebe o texto em pedaços quaisquer —
 * um evento partido entre dois chunks, vários num chunk só — e entrega o
 * `data` de cada evento completo. Comentários (`:`) e os campos `event`,
 * `id` e `retry` não interessam ao copiloto; um evento sem a linha em branco
 * final, no fim do corpo, é descartado, como manda a especificação.
 */
export function createSseParser(onData: (data: string) => void): { push: (text: string) => void } {
  let buffer = "";
  return {
    push(text) {
      buffer += text;
      for (let end = EVENT_END.exec(buffer); end; end = EVENT_END.exec(buffer)) {
        const block = buffer.slice(0, end.index);
        buffer = buffer.slice(end.index + end[0].length);
        const data = dataOf(block);
        if (data !== null) onData(data);
      }
    },
  };
}

/**
 * Lê o corpo SSE até o fim, ou até `onData` devolver `true` (o `done` ou o
 * `error` do servidor) — aí a leitura para e a conexão é liberada. O
 * decodificador em modo stream junta um caractere acentuado partido entre
 * dois chunks. Rejeita se a conexão cair no meio.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => boolean,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let stopped = false;
  const parser = createSseParser((data) => {
    if (!stopped && onData(data)) stopped = true;
  });

  while (!stopped) {
    const { done, value } = await reader.read();
    if (done) {
      parser.push(decoder.decode());
      return;
    }
    parser.push(decoder.decode(value, { stream: true }));
  }
  await reader.cancel().catch(() => undefined);
}

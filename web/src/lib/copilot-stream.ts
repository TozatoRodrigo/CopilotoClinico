/**
 * Regras do streaming do copiloto que não dependem de React: o teto das
 * respostas na URL da reanálise e o erro que diz se ainda dá para cair no
 * POST sem duplicar a análise. Ver use-copilot-stream.ts.
 */
import type { ClarifyingAnswer } from "@/lib/types";
import type { MAX_RESPOND_STREAM_ANSWERS_LENGTH as ContractMaxRespondStreamAnswersLength } from "@contracts/clinical";

/**
 * Teto do JSON das respostas na querystring do streaming da reanálise — o
 * mesmo que o backend aceita, conferido contra o contrato em tempo de
 * compilação. EventSource só faz GET, e URL longa estoura limite de navegador
 * e de proxy de hospital: acima dele, a reanálise vai direto pelo POST.
 */
export const MAX_RESPOND_STREAM_ANSWERS_LENGTH: typeof ContractMaxRespondStreamAnswersLength = 3000;

export function isRespondStreamEligible(answers: ClarifyingAnswer[]): boolean {
  return JSON.stringify(answers).length <= MAX_RESPOND_STREAM_ANSWERS_LENGTH;
}

/**
 * Falha do streaming. `neverOpened` só é verdadeiro quando a conexão nunca
 * abriu (rede, proxy bloqueando SSE, 4xx): o servidor não começou a análise,
 * e quem chamou pode refazer pelo POST. Depois que a conexão abre, o servidor
 * já está analisando — mesmo sem nenhum frame ainda, durante os ~20 s da
 * Etapa 1 — e refazer gravaria uma segunda análise. Um `error` do servidor é
 * a resposta dele (a falha já foi gravada), não falta de conexão.
 */
export class CopilotStreamError extends Error {
  readonly neverOpened: boolean;

  constructor(message: string, neverOpened: boolean) {
    super(message);
    this.name = "CopilotStreamError";
    this.neverOpened = neverOpened;
  }
}

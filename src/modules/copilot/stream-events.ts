import { HttpException, Logger, type MessageEvent } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PassThrough } from 'node:stream';
import { Observable } from 'rxjs';
import type { StreamEvent } from './orchestrator/orchestrator.service';

const logger = new Logger('CopilotEventStream');

/**
 * SSE dos streamings do copiloto (análise inicial, conversa do Copiloto
 * guiado e reanálise): cada evento do orquestrador vira um `data: <json>` e o
 * stream fecha no `done` ou no `error`. O gerador só é criado na inscrição —
 * o Observable é frio — e segue até o fim mesmo se o médico fechar a aba: a
 * análise fica gravada e aparece quando o caso for reaberto.
 */
export function streamEvents(open: () => AsyncGenerator<StreamEvent>): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    const gen = open();

    void (async () => {
      try {
        for await (const event of gen) {
          subscriber.next({ data: event });
          if (event.type === 'done' || event.type === 'error') break;
        }
        subscriber.complete();
      } catch (err) {
        subscriber.error(err);
      }
    })();
  });
}

/** Um evento no formato text/event-stream: `data: <json>` e uma linha em branco. */
function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Os eventos de `streamEvents` como corpo text/event-stream de uma resposta
 * comum do Fastify — para rota POST, que o @Sse do Nest (só GET) não atende:
 * a reanálise manda as respostas do médico no corpo, nunca na URL (ADR-014).
 * `reply.send` mantém o que vale para as outras rotas: guards, throttling e
 * interceptors já rodaram, e os cabeçalhos de CORS com credenciais e do
 * helmet ficam na resposta.
 *
 * - O comentário inicial tira os cabeçalhos na hora: o Fastify só os escreve
 *   com o primeiro byte, e a Etapa 1 passa ~20 s sem evento. É a conexão
 *   aberta que diz ao web que refazer pelo POST gravaria outra análise.
 * - Se o médico desconecta, a escrita para; o gerador segue até o fim (ver
 *   `streamEvents`) e a reanálise fica gravada — a conversa a mostra ao
 *   recarregar, como nas rotas @Sse e no POST /respond.
 * - Falha depois de aberto vira evento `error`: o status 200 já foi enviado.
 */
export function sendEventStream(
  reply: FastifyReply,
  events: Observable<MessageEvent>,
): FastifyReply {
  const body = new PassThrough();
  const open = () => !body.destroyed && !body.writableEnded;

  body.write(': stream aberto\n\n');
  const subscription = events.subscribe({
    next: (message) => {
      if (open()) body.write(sseFrame(message.data));
    },
    error: (error: unknown) => {
      logger.error(
        `EVENT_STREAM_FAILED: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      const message = error instanceof HttpException ? error.message : 'Internal server error';
      if (open()) body.end(sseFrame({ type: 'error', errors: [message] }));
    },
    complete: () => {
      if (open()) body.end();
    },
  });
  body.on('close', () => subscription.unsubscribe());

  return reply
    .code(200)
    .header('Content-Type', 'text/event-stream; charset=utf-8')
    .header('Cache-Control', 'no-cache, no-transform')
    .header('X-Accel-Buffering', 'no')
    .send(body);
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import type { StreamEvent } from './orchestrator/orchestrator.service';
import { sendEventStream, streamEvents } from './stream-events';

/**
 * A resposta POST em text/event-stream num socket de verdade: o que o web usa
 * para decidir se ainda pode refazer pelo POST é a chegada dos cabeçalhos.
 */

const done = { type: 'done', result: { interactionId: 'interaction-002' } } as StreamEvent;

/** Um evento que só sai quando o teste deixa — a Etapa 1 leva ~20 s sem evento. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

describe('sendEventStream', () => {
  let app: FastifyInstance | null = null;
  /** Resolve quando o servidor percebe que o cliente fechou a conexão. */
  let clientClosed: Promise<void> = Promise.resolve();

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  async function serve(events: () => AsyncGenerator<StreamEvent>): Promise<string> {
    app = Fastify();
    app.post('/stream', (_request, reply) => {
      clientClosed = new Promise((resolve) => reply.raw.on('close', () => resolve()));
      return sendEventStream(reply, streamEvents(events));
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/stream`;
  }

  function post(url: string): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = request(url, { method: 'POST' }, resolve);
      req.on('error', reject);
      req.end();
    });
  }

  it('sends the 200 headers right away, before the first event', async () => {
    const firstEvent = gate();
    const url = await serve(async function* () {
      await firstEvent.opened;
      yield done;
    });

    const res = await post(url);

    // A resposta abriu com o gerador ainda parado antes do primeiro evento.
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    firstEvent.open();
    let body = '';
    for await (const chunk of res) body += String(chunk);
    expect(body).toBe(`: stream aberto\n\ndata: ${JSON.stringify(done)}\n\n`);
  });

  it('keeps running the analysis after the client disconnects, so it is still recorded', async () => {
    const rest = gate();
    let recorded = false;
    const url = await serve(async function* () {
      yield { type: 'delta', delta: '{' };
      await rest.opened;
      yield { type: 'delta', delta: '}' };
      // Aqui o orquestrador grava a interação (settleAnalysis), antes do done.
      recorded = true;
      yield done;
    });

    const res = await post(url);
    await new Promise<void>((resolve) => {
      res.on('data', (chunk) => {
        if (String(chunk).includes('data:')) resolve();
      });
    });
    res.destroy();
    await clientClosed;
    rest.open();

    await vi.waitFor(() => expect(recorded).toBe(true));
  });
});

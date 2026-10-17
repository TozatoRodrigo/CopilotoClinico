import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { configWith } from '../../../tests/helpers/fake-deid';
import { DeidModelError, HttpDeidModelClient } from './deid-model.client';

type Handler = (body: string, response: ServerResponse) => void;

/** Fake do serviço copiloto-deid: um servidor HTTP de verdade, na porta que o SO der. */
async function fakeService(handler: Handler): Promise<{ url: string; server: Server }> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    request.on('end', () => handler(body, response));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, server };
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof DeidModelError)) throw new Error(`esperava DeidModelError: ${error}`);
  return error.reason;
}

describe('HttpDeidModelClient (CC-203)', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
    );
  });

  async function clientFor(handler: Handler): Promise<HttpDeidModelClient> {
    const { url, server } = await fakeService(handler);
    servers.push(server);
    return new HttpDeidModelClient(configWith({ DEID_SERVICE_URL: url }));
  }

  it('manda o texto e devolve os trechos do serviço', async () => {
    const received: unknown[] = [];
    const client = await clientFor((body, response) => {
      received.push(JSON.parse(body));
      json(response, 200, {
        entities: [{ label: 'FIRSTNAME', start: 9, end: 14, score: 0.99 }],
        revision: 'x',
        latencyMs: 3,
      });
    });

    const entities = await client.findEntities('Paciente Maria com febre', 1000);

    expect(received).toEqual([{ text: 'Paciente Maria com febre' }]);
    expect(entities).toEqual([{ label: 'FIRSTNAME', start: 9, end: 14, score: 0.99 }]);
  });

  it('serviço lento além do teto: timeout', async () => {
    const client = await clientFor((_body, response) => {
      setTimeout(() => json(response, 200, { entities: [] }), 300);
    });

    expect(await reasonOf(client.findEntities('texto', 30))).toBe('timeout');
  });

  it('serviço fora do ar: unavailable', async () => {
    const { url, server } = await fakeService(() => undefined);
    await new Promise((resolve) => server.close(resolve));
    const client = new HttpDeidModelClient(configWith({ DEID_SERVICE_URL: url }));

    expect(await reasonOf(client.findEntities('texto', 1000))).toBe('unavailable');
  });

  it('503 (carregando ou fila cheia) é unavailable; outro erro HTTP é bad_status', async () => {
    const busy = await clientFor((_body, response) => json(response, 503, { detail: 'busy' }));
    const broken = await clientFor((_body, response) => json(response, 500, {}));

    expect(await reasonOf(busy.findEntities('texto', 1000))).toBe('unavailable');
    expect(await reasonOf(broken.findEntities('texto', 1000))).toBe('bad_status');
  });

  it('resposta fora do contrato (JSON quebrado, rótulo desconhecido) é bad_response', async () => {
    const notJson = await clientFor((_body, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"entities": [');
    });
    const unknownLabel = await clientFor((_body, response) =>
      json(response, 200, { entities: [{ label: 'CITY', start: 0, end: 4, score: 0.9 }] }),
    );

    expect(await reasonOf(notJson.findEntities('texto', 1000))).toBe('bad_response');
    expect(await reasonOf(unknownLabel.findEntities('texto', 1000))).toBe('bad_response');
  });
});

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Quem pediu e sobre o quê, disponível em qualquer ponto da requisição sem
 * passar parâmetro: liga o log de acesso, cada chamada de IA (ai_calls) e a
 * interação gravada (ai_interactions.request_id) pelo mesmo `requestId`.
 */
export interface RequestContext {
  requestId: string;
  physicianId: string | null;
  encounterId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Id que o cliente ou o proxy mandam em `x-request-id`, se tiver forma segura de logar. */
const FORWARDED_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function runWithRequestContext<T>(context: RequestContext, run: () => T): T {
  return storage.run(context, run);
}

/** `undefined` fora de uma requisição HTTP (fila, cron, gabarito). */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requestIdFrom(header: unknown): string {
  return typeof header === 'string' && FORWARDED_REQUEST_ID.test(header) ? header : randomUUID();
}

/** Só um UUID vira referência gravável; o resto da rota não é confiável aqui. */
export function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

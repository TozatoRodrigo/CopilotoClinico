import type { ErrorEvent } from '@sentry/node';

/** Cabeçalhos que ajudam a depurar e não carregam credencial nem dado do médico. */
const KEPT_HEADERS = new Set(['user-agent', 'content-type', 'content-length', 'accept']);

/**
 * O SDK anexa à exceção o corpo, a query, os cookies e os cabeçalhos da
 * requisição. Aqui o corpo é o texto do caso e as respostas do médico, e os
 * cabeçalhos levam o token: tudo sai antes do envio. Método e caminho ficam.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const { request } = event;
  if (!request) return event;
  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())),
  );
  return {
    ...event,
    request: { method: request.method, url: request.url?.split('?')[0], headers },
  };
}

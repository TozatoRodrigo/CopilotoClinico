/*
 * Service worker do Copiloto (PWA).
 *
 * CC-322 — Ferramentas offline: na primeira vez que o app abre com sinal, o
 * service worker baixa as páginas de /ferramentas/** e os chunks que elas usam
 * (lista gerada no build: /ferramentas-offline.json). Sem sinal, ACLS,
 * Pediatria, Infusões, Calculadoras e as demais ferramentas abrem do cache.
 * Cada versão do conteúdo tem o seu cache; a nova só substitui a antiga
 * depois de baixada inteira. A página pede a atualização ao abrir e ao voltar
 * a ter sinal (mensagem `ferramentas-sync`).
 */
const CACHE_VERSION = 'v4';
const STATIC_CACHE = `copiloto-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `copiloto-runtime-${CACHE_VERSION}`;
const TOOLS_CACHE_PREFIX = 'copiloto-ferramentas-';
const TOOLS_MANIFEST = '/ferramentas-offline.json';
const APP_SHELL = ['/dashboard', '/manifest.json', '/'];
/** Com sinal ruim, a troca de tela das Ferramentas não espera mais que isso pela rede. */
const TOOLS_RSC_TIMEOUT_MS = 4000;
const PRECACHE_BATCH = 6;

let syncing = null;

function isToolsPath(pathname) {
  return pathname === '/ferramentas' || pathname.startsWith('/ferramentas/');
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage(message);
}

/** Cache de ferramentas completo (o manifesto só entra depois de tudo baixado). */
async function readyToolsCache() {
  const keys = await caches.keys();
  for (const key of keys) {
    if (!key.startsWith(TOOLS_CACHE_PREFIX)) continue;
    const cache = await caches.open(key);
    const manifest = await cache.match(TOOLS_MANIFEST);
    if (manifest) return { cache, manifest: await manifest.json() };
  }
  return null;
}

async function precache(cache, url) {
  // `redirect: 'manual'`: sessão vencida manda para /login; isso não pode
  // ficar guardado no lugar da ferramenta.
  const response = await fetch(url, {
    cache: 'no-cache',
    credentials: 'same-origin',
    redirect: 'manual',
  });
  if (!response.ok || response.type === 'opaqueredirect') {
    throw new Error(`pré-cache falhou: ${url} (${response.status})`);
  }
  await cache.put(url, response);
}

/**
 * Baixa a versão atual das Ferramentas se ainda não estiver completa e apaga
 * as anteriores. Sem sinal, sem manifesto (Ferramentas desligadas) ou com a
 * sessão vencida, não muda nada: o cache completo anterior continua valendo.
 */
function syncTools() {
  if (syncing) return syncing;
  syncing = (async () => {
    let manifest;
    try {
      const response = await fetch(TOOLS_MANIFEST, { cache: 'no-store' });
      if (!response.ok) return;
      manifest = await response.json();
    } catch {
      return;
    }
    const name = TOOLS_CACHE_PREFIX + manifest.version;
    const cache = await caches.open(name);
    if (!(await cache.match(TOOLS_MANIFEST))) {
      await notifyClients({
        type: 'ferramentas-offline',
        status: 'baixando',
        version: manifest.version,
      });
      const urls = [...manifest.routes, ...manifest.assets];
      for (let index = 0; index < urls.length; index += PRECACHE_BATCH) {
        await Promise.all(
          urls.slice(index, index + PRECACHE_BATCH).map((url) => precache(cache, url)),
        );
      }
      await cache.put(
        TOOLS_MANIFEST,
        new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }),
      );
    }
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(TOOLS_CACHE_PREFIX) && key !== name)
        .map((key) => caches.delete(key)),
    );
    await notifyClients({
      type: 'ferramentas-offline',
      status: 'pronto',
      version: manifest.version,
    });
  })()
    .catch(() => notifyClients({ type: 'ferramentas-offline', status: 'incompleto' }))
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== STATIC_CACHE &&
                key !== RUNTIME_CACHE &&
                !key.startsWith(TOOLS_CACHE_PREFIX),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
  // Fora do waitUntil: a ativação não espera os megabytes das Ferramentas.
  syncTools();
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'ferramentas-sync') {
    event.waitUntil(syncTools());
  } else if (data.type === 'ferramentas-status') {
    event.waitUntil(
      readyToolsCache().then((ready) =>
        event.source?.postMessage({
          type: 'ferramentas-offline',
          status: ready ? 'pronto' : 'ausente',
          version: ready?.manifest.version,
        }),
      ),
    );
  }
});

function putInCache(cacheName, request, response) {
  if (response.ok && response.type === 'basic') {
    const clone = response.clone();
    caches.open(cacheName).then((cache) => cache.put(request, clone));
  }
  return response;
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Página de ferramenta: do cache completo na hora; rede só se não houver cache. */
async function toolsNavigation(request) {
  const ready = await readyToolsCache();
  const cached = ready ? await ready.cache.match(request, { ignoreSearch: true }) : undefined;
  if (cached) return cached;
  try {
    return putInCache(RUNTIME_CACHE, request, await fetch(request));
  } catch {
    return (
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match('/dashboard')) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === TOOLS_MANIFEST || url.pathname === '/sw.js') return;

  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(?:js|css|woff2?|png|jpg|jpeg|gif|svg|webp|avif|ico)$/);
  const isApiRoute = url.pathname.startsWith('/v1/');
  const isRsc = request.headers.get('RSC') === '1' || url.searchParams.has('_rsc');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          fetch(request)
            .then((response) => putInCache(STATIC_CACHE, request, response))
            .catch(() => {});
          return cached;
        }
        return fetch(request).then((response) => putInCache(STATIC_CACHE, request, response));
      }),
    );
    return;
  }

  if (isApiRoute) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate' && isToolsPath(url.pathname)) {
    event.respondWith(toolsNavigation(request));
    return;
  }

  if (isRsc) {
    // Payload RSC de troca de tela: sem rede (ou rede lenta nas Ferramentas),
    // erro de rede faz o Next recarregar o endereço como página inteira, e a
    // página vem do cache acima. HTML no lugar de RSC quebraria a tela.
    const pending = isToolsPath(url.pathname)
      ? fetchWithTimeout(request, TOOLS_RSC_TIMEOUT_MS)
      : fetch(request);
    event.respondWith(
      pending
        .then((response) => putInCache(RUNTIME_CACHE, request, response))
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => putInCache(RUNTIME_CACHE, request, response))
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const shell = request.mode === 'navigate' ? await caches.match('/dashboard') : undefined;
        return (
          shell ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        );
      }),
  );
});

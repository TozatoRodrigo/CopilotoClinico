const CACHE_VERSION = 'v3';
const STATIC_CACHE = `copiloto-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `copiloto-runtime-${CACHE_VERSION}`;
const APP_SHELL = ['/dashboard', '/manifest.json', '/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
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
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(?:js|css|woff2?|png|jpg|jpeg|gif|svg|webp|avif|ico)$/);
  const isApiRoute = url.pathname.startsWith('/v1/');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          fetch(request)
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(STATIC_CACHE).then((cache) => {
                  cache.put(request, clone);
                });
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
      }),
    );
    return;
  }

  if (isApiRoute) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            caches.match('/dashboard').then(
              (shell) =>
                shell ||
                new Response('Offline', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' },
                }),
            ),
        ),
      ),
  );
});

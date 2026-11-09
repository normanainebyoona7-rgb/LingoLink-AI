/**
 * LingoLink service worker.
 * Lives in public/ so Vite copies it verbatim — no bundling, no tree-shaking.
 */

const SW_VERSION = 'v1';
const SHELL_CACHE = `lingolink-shell-${SW_VERSION}`;
const DATA_CACHE = `lingolink-data-${SW_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (e) {
            console.warn('SW: failed to cache ' + url, e);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Fetch routing
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // API calls pass through
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/tts/') ||
    url.pathname.startsWith('/translate/') ||
    url.pathname.startsWith('/speech/')
  ) {
    return;
  }

  // /offline/* data: cache-first
  if (url.pathname.startsWith('/offline/')) {
    event.respondWith(cacheFirst(req, DATA_CACHE));
    return;
  }

  // Navigation + app shell: network-first
  if (req.mode === 'navigate' || isShellAsset(url.pathname)) {
    event.respondWith(networkFirstShell(req));
    return;
  }

  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

function isShellAsset(pathname) {
  return (
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  );
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp.ok && resp.type !== 'opaque') {
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (e) {
    return new Response('Offline and not cached', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function networkFirstShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const index = await cache.match('/index.html');
      if (index) return index;
    }
    return new Response('Offline and not cached', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// Message handler
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_DATA_CACHE') event.waitUntil(caches.delete(DATA_CACHE));
});

console.log('[SW] LingoLink service worker loaded');
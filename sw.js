// ============================================================
// ClipForge Service Worker
// Injects Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy
// headers on every response so SharedArrayBuffer is available
// for ffmpeg.wasm — works on ANY static host, no server config needed.
// ============================================================

const SW_VERSION = 'clipforge-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and rewrite headers
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
      .catch(() => fetch(event.request))
  );
});

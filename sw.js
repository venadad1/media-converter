// ============================================================
// ClipForge Service Worker
// Injects Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy
// headers on every response so SharedArrayBuffer is available
// for ffmpeg.wasm — works on ANY static host, no server config needed.
// ============================================================

const SW_VERSION = 'clipforge-v2';

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
        // Opaque / opaqueredirect responses (cross-origin requests made
        // without CORS, e.g. plain <script src> to a third-party domain,
        // ad network scripts, Google Fonts) cannot be re-wrapped: their
        // status is forced to 0 and body is hidden. Constructing a new
        // Response with status 0 throws, so just pass these through as-is.
        if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) {
          return response;
        }

        // Clone and rewrite headers on real (same-origin or CORS) responses
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

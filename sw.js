// ClipForge Service Worker
// Registered ONLY from editor.html — never touches index.html or ad resources.
// Provides COOP/COEP headers as a fallback when server-side headers aren't set
// (e.g. incognito on first visit before SW activates, or misconfigured host).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only intercept same-origin requests — never touch cross-origin ad resources
  if (url.origin !== self.location.origin) return;

  // Only intercept editor.html and local assets (js/, css/, fonts loaded by editor)
  // Skip index.html entirely — it must NOT get COEP or ads break
  const path = url.pathname;
  const isEditorPage  = path === '/editor.html' || path === '/editor';
  const isLocalAsset  = path.startsWith('/js/') || path.startsWith('/css/');

  if (!isEditorPage && !isLocalAsset) return;

  e.respondWith(
    fetch(e.request).then(response => {
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }).catch(() => fetch(e.request))
  );
});

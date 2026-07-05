// ============================================================
// ClipForge — Service Worker Bootstrap
// Must be loaded as the FIRST script on the page.
// Registers the SW and reloads once if needed so COOP/COEP
// headers are active before ffmpeg.wasm is ever requested.
// ============================================================

(function () {
  if (!('serviceWorker' in navigator)) {
    console.warn('[ClipForge] Service Workers not supported — ffmpeg.wasm may fail without COOP/COEP headers.');
    return;
  }

  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then((reg) => {
      // If a new SW just installed and took control, reload so all
      // subsequent fetches go through it (COOP/COEP will be set).
      if (reg.installing || reg.waiting) {
        reg.installing?.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') {
            console.log('[ClipForge] SW activated — reloading for COOP/COEP...');
            window.location.reload();
          }
        });
        reg.waiting?.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') {
            window.location.reload();
          }
        });
      } else {
        console.log('[ClipForge] SW already active ✓');
      }
    })
    .catch((err) => {
      console.error('[ClipForge] SW registration failed:', err);
    });
})();

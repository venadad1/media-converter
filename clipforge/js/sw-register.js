// Registers SW only when running inside editor.html
// This ensures SW never intercepts index.html requests or ad network calls
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(reg => {
      if (reg.installing) {
        reg.installing.addEventListener('statechange', e => {
          if (e.target.state === 'activated') {
            // SW just activated — reload so editor.html gets isolated headers
            window.location.reload();
          }
        });
      } else if (reg.active) {
        // SW already active — check if SharedArrayBuffer is available
        if (typeof SharedArrayBuffer === 'undefined') {
          // Headers not yet applied to this page load — reload once
          const reloaded = sessionStorage.getItem('cf-sw-reload');
          if (!reloaded) {
            sessionStorage.setItem('cf-sw-reload', '1');
            window.location.reload();
          }
        }
      }
    })
    .catch(err => console.warn('[ClipForge SW]', err));
}

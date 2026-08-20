import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// Build marker — check the console to confirm which version is actually loaded
// (helps tell a fresh deploy apart from a stale service-worker cache).
console.log('[Divido] build 2026-08-20-cache-v3');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Register the service worker for offline support + faster loads. Uses
// network-first for pages, so new deploys still reach users promptly.
if ('serviceWorker' in navigator) {
  // When a freshly-deployed service worker takes control, reload once so the
  // new app version applies on the FIRST reopen (previously it took two —
  // the first launch still showed the old cached build). The guard prevents
  // any reload loop.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Proactively check for a new version on every load.
        reg.update?.();
      })
      .catch(() => {
        /* offline support is a progressive enhancement — ignore failures */
      });
  });
}

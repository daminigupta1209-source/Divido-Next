import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// Build marker — check the console to confirm which version is actually loaded
// (helps tell a fresh deploy apart from a stale service-worker cache).
console.log('[Divido] build 2026-08-20-cache-v3');

// One-time local reset for the permanent-group-id migration. The old model
// stored groups/expenses with temporary float ids that no longer fit the new
// UUID scheme; clear cached local copies once so every device starts clean on
// the fresh-reset cloud. Runs before React reads localStorage, so the app boots
// from an empty, consistent state and re-hydrates from the cloud.
try {
  const SCHEMA_VERSION = 'v2-uuid-gid';
  if (localStorage.getItem('divido_schema_version') !== SCHEMA_VERSION) {
    [
      'divido_groups',
      'divido_expenses',
      'divido_last_synced_groups',
      'divido_last_synced_expenses',
      'divido_backup_groups',
      'divido_backup_expenses',
      'divido_gid_map',
    ].forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('divido_schema_version', SCHEMA_VERSION);
  }
} catch { /* localStorage unavailable — nothing to reset */ }

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

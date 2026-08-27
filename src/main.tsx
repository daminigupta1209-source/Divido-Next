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
  // When a freshly-deployed service worker takes control, DON'T silently reload
  // (that used to wipe whatever the user was typing in a modal). Instead show a
  // small "New version — tap to reload" bar and let them choose when. Skipped on
  // the very first install (no previous controller), where the page is already
  // current and no reload is needed.
  let bannerShown = false;
  const hadController = !!navigator.serviceWorker.controller;

  const showUpdateBanner = () => {
    if (bannerShown || document.getElementById('dv-update-bar')) return;
    bannerShown = true;
    const bar = document.createElement('div');
    bar.id = 'dv-update-bar';
    bar.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:2147483647;' +
      'background:#0F172A;color:#fff;padding:10px 12px 10px 16px;border-radius:14px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.28);display:flex;align-items:center;gap:12px;' +
      "font-family:Nunito,-apple-system,sans-serif;font-size:13px;font-weight:700;max-width:calc(100vw - 32px);";
    const txt = document.createElement('span');
    txt.textContent = 'New version available';
    const btn = document.createElement('button');
    btn.textContent = 'Reload';
    btn.style.cssText =
      'background:#10B981;color:#fff;border:none;border-radius:10px;padding:7px 16px;' +
      'font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;';
    btn.onclick = () => window.location.reload();
    bar.appendChild(txt);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install — nothing to update
    showUpdateBanner();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Check for a new version on load AND repeatedly while the app stays
        // open — a PWA is rarely fully closed, so a once-per-load check would
        // never notice a fresh deploy. Poll on an interval and whenever the app
        // regains focus, so the "New version available" banner actually appears.
        const checkForUpdate = () => { try { reg.update?.(); } catch { /* ignore */ } };
        checkForUpdate();
        setInterval(checkForUpdate, 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);

        // Belt-and-suspenders: if a new worker is found and finishes installing
        // while we already have a controller, surface the banner even if the
        // controllerchange event is missed.
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      })
      .catch(() => {
        /* offline support is a progressive enhancement — ignore failures */
      });
  });
}

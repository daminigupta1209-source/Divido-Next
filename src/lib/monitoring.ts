// Crash alerts (Sentry). Off until VITE_SENTRY_DSN is set in Vercel, so this
// is safe to ship before the Sentry project exists.
//
// What gets reported:
//   * any uncaught error / promise rejection while the app runs,
//   * React render crashes (ErrorBoundary calls reportError),
//   * start-up failures ("Divido could not start"): those happen before this
//     code can load, so index.html saves them in localStorage and they are
//     sent here the next time the app does start.
// No personal data: no emails, names, amounts or IP addresses are attached.
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
let enabled = false;

export const initMonitoring = (): void => {
  if (!DSN || import.meta.env.DEV) return;
  try {
    Sentry.init({
      dsn: DSN,
      environment: 'production',
      // Errors only — no performance tracing or session replay.
      tracesSampleRate: 0,
      // Noise from browser extensions / flaky networks, not Divido bugs.
      ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', 'Load failed', 'NetworkError when attempting to fetch resource'],
    });
    enabled = true;
    sendSavedStartupErrors();
  } catch {
    /* monitoring must never break the app */
  }
};

export const reportError = (err: unknown, context?: Record<string, unknown>): void => {
  if (!enabled) return;
  try { Sentry.captureException(err, context ? { extra: context } : undefined); } catch { /* ignore */ }
};

// Start-up failures saved by index.html while the app couldn't load.
const sendSavedStartupErrors = (): void => {
  try {
    const raw = localStorage.getItem('dv_startup_errors');
    if (!raw) return;
    localStorage.removeItem('dv_startup_errors');
    const list = JSON.parse(raw) as Array<{ at: string; errors: string[] }>;
    list.slice(-5).forEach((entry) => {
      Sentry.captureMessage('Divido could not start', {
        level: 'error',
        extra: { at: entry.at, errors: entry.errors },
      });
    });
  } catch { /* ignore */ }
};

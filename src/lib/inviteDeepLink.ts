import { isNativeApp } from './publicUrl';

// ─────────────────────────────────────────────────────────────────────────
// Native-only: shared invite links (https://www.fussky.com/?joinGroupId=…
// or ?invite=…) open the installed app via Android App Links. The WebView
// doesn't navigate on its own, so reload it at the same query string; the
// existing web join flow then reads it from window.location.search.
// ─────────────────────────────────────────────────────────────────────────

const APP_LINK_HOSTS = ['www.fussky.com', 'fussky.com'];
// `open` = reminder link to the Non-Group screen.
const INVITE_PARAMS = ['joinGroupId', 'invite', 'open'];
// A launch URL survives in-app reloads (e.g. after Google sign-in), so
// remember the one we've handled or we'd bounce back into the invite.
const HANDLED_KEY = 'fussky_handled_app_link';

function inviteSearch(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !APP_LINK_HOSTS.includes(u.hostname)) return null;
    if (!INVITE_PARAMS.some((p) => u.searchParams.has(p))) return null;
    return u.search;
  } catch {
    return null;
  }
}

function openInvite(url: string, fromLaunch: boolean): void {
  const search = inviteSearch(url);
  if (!search) return;
  if (fromLaunch) {
    try {
      if (sessionStorage.getItem(HANDLED_KEY) === url) return;
      sessionStorage.setItem(HANDLED_KEY, url);
    } catch { /* storage unavailable: equality check below still stops loops */ }
  }
  if (window.location.pathname === '/' && window.location.search === search) return;
  window.location.replace(`/${search}`);
}

/** Call once at startup. No-op on web. */
export function initNativeInviteLinks(): void {
  if (!isNativeApp()) return;
  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      await App.addListener('appUrlOpen', ({ url }) => openInvite(url, false));
      const launch = await App.getLaunchUrl();
      if (launch?.url) openInvite(launch.url, true);
    } catch (err) {
      console.error('Could not listen for invite links:', err);
    }
  })();
}

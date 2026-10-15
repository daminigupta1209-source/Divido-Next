import { supabase } from './supabaseClient';
import { isNativeApp } from './publicUrl';

// ─────────────────────────────────────────────────────────────────────────
// Google sign-in for web and the native (Capacitor) app.
//
// Web: Supabase redirects the whole page to Google and back to
// `${origin}${path}${suffix}` (unchanged from the original inline calls).
// Native: Google refuses OAuth inside an embedded WebView, and the WebView's
// https://localhost origin can't be a redirect target anyway. So we ask
// Supabase for the authorize URL without redirecting (skipBrowserRedirect),
// open it in the system browser tab (@capacitor/browser — Custom Tabs /
// SFSafariViewController, which Google allows), and have Supabase redirect to
// the app's custom scheme (com.dividosplit.app://auth-callback). Android/iOS
// route that back to the app; @capacitor/app delivers it as `appUrlOpen`.
//
// `com.dividosplit.app://auth-callback` must be in Supabase → Authentication →
// URL Configuration → Redirect URLs, otherwise Supabase falls back to the Site
// URL and the user lands on the website inside the browser tab.
// ─────────────────────────────────────────────────────────────────────────

const NATIVE_AUTH_CALLBACK = 'com.dividosplit.app://auth-callback';
// Where to land after a native sign-in (path + invite query). Kept in
// localStorage rather than on the redirect URL so the Supabase allow-list
// entry can stay an exact match.
const RETURN_PATH_KEY = 'divido_native_oauth_return';
const HANDLED_URL_KEY = 'divido_native_oauth_handled';

/** Signs in with Google. `suffix` is an optional `?invite=…`/`?joinGroupId=…` to resume after sign-in. */
export async function signInWithGoogle(suffix = ''): Promise<void> {
  const queryParams = { prompt: 'select_account' };

  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname + suffix,
        queryParams,
      },
    });
    if (error) throw error;
    return;
  }

  try {
    localStorage.setItem(RETURN_PATH_KEY, window.location.pathname + suffix);
  } catch { /* storage full — we just land on the home screen */ }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true, queryParams },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in.');

  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url });
}

/** Reads `key` from the callback's fragment (implicit flow) or query (PKCE / errors). */
function readParam(url: URL, key: string): string | null {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  return hash.get(key) ?? url.searchParams.get(key);
}

async function completeNativeSignIn(rawUrl: string): Promise<void> {
  // getLaunchUrl() keeps returning the URL that cold-started the app, even
  // after our reload below — handle each callback only once or we'd loop.
  try {
    if (sessionStorage.getItem(HANDLED_URL_KEY) === rawUrl) return;
    sessionStorage.setItem(HANDLED_URL_KEY, rawUrl);
  } catch { /* ignore */ }

  import('@capacitor/browser')
    .then(({ Browser }) => Browser.close())
    .catch(() => { /* browser tab already gone */ });

  let returnPath = '/';
  try {
    returnPath = localStorage.getItem(RETURN_PATH_KEY) || '/';
    localStorage.removeItem(RETURN_PATH_KEY);
  } catch { /* ignore */ }

  try {
    const url = new URL(rawUrl);
    const oauthError = readParam(url, 'error_description') || readParam(url, 'error');
    if (oauthError) throw new Error(oauthError);

    const code = readParam(url, 'code');
    const accessToken = readParam(url, 'access_token');
    const refreshToken = readParam(url, 'refresh_token');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw error;
    } else {
      throw new Error('Google sign-in returned no session.');
    }
  } catch (err) {
    console.error('Native Google sign-in failed:', err);
    window.alert(`Google sign-in failed: ${err instanceof Error && err.message ? err.message : 'please try again.'}`);
    return;
  }

  // Same end state as the web redirect: boot the app fresh, signed in, on the
  // page (and invite) the sign-in started from.
  window.location.replace(returnPath.startsWith('/') ? returnPath : '/');
}

/**
 * Native-only: completes Google sign-in when the auth deep link opens the app,
 * whether it was running (`appUrlOpen`) or cold-started by the link
 * (`getLaunchUrl`). Call once at startup. No-op on web.
 */
export function initNativeAuthCallback(): void {
  if (!isNativeApp()) return;
  const isAuthCallback = (url: string | undefined): url is string =>
    !!url && url.startsWith(NATIVE_AUTH_CALLBACK);

  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      await App.addListener('appUrlOpen', ({ url }) => {
        if (isAuthCallback(url)) void completeNativeSignIn(url);
      });
      const launch = await App.getLaunchUrl();
      if (isAuthCallback(launch?.url)) void completeNativeSignIn(launch.url);
    } catch (err) {
      console.error('Could not listen for the sign-in callback:', err);
    }
  })();
}

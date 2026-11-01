import { Capacitor } from '@capacitor/core';

// ─────────────────────────────────────────────────────────────────────────
// Public origin for links that leave the device (invites, share text).
//
// Web: window.location.origin, so previews/localhost keep linking to
// themselves. Native (Capacitor): the WebView's origin is https://localhost,
// which is meaningless to anyone the link is sent to, so use the deployed
// web app instead. Override with VITE_PUBLIC_APP_URL. The old Vercel
// production host also maps to the public URL, so links use the real domain.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_PUBLIC_APP_URL = 'https://www.fussky.com';
const LEGACY_HOSTS = ['divido-next.vercel.app'];

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Origin (no trailing slash) to put in links shared with other people. */
export function getPublicOrigin(): string {
  if (!isNativeApp() && !LEGACY_HOSTS.includes(window.location.hostname)) {
    return window.location.origin;
  }
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
  return (configured || DEFAULT_PUBLIC_APP_URL).replace(/\/+$/, '');
}

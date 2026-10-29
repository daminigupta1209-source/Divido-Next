import { supabase } from './supabaseClient';
import { getPublicOrigin, isNativeApp } from './publicUrl';

// ─────────────────────────────────────────────────────────────────────────
// All Gemini calls go through the Vercel function api/scan.js, which holds
// the Gemini key server-side and checks the caller's Supabase session.
// The native app's origin is https://localhost, so it has to call the
// deployed web app's absolute URL (VITE_PUBLIC_APP_URL).
// ─────────────────────────────────────────────────────────────────────────

export type AiRequest =
  | { kind: 'receipt'; image: string; mimeType: string }
  | { kind: 'voice'; transcript: string; members: string[]; me: string }
  | { kind: 'emoji'; title: string };

export function getAiEndpoint(): string {
  return isNativeApp() ? `${getPublicOrigin()}/api/scan` : '/api/scan';
}

export async function callAi<T = any>(body: AiRequest, signal?: AbortSignal): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sign in to use AI features.');

  const res = await fetch(getAiEndpoint(), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `AI request failed: Status ${res.status}`);
  return data as T;
}

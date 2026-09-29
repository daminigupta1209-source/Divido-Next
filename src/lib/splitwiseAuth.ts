import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────
// Splitwise OAuth (authorization-code flow) + import API client.
//
// Web: the app redirects the whole page to Splitwise's authorize screen and
// back to `${origin}/splitwise-callback` (see vercel.json's SPA rewrite).
// Native: Splitwise doesn't allow custom-scheme redirect URIs, so we open the
// SAME https callback page inside an in-app browser (@capacitor/browser),
// which "bounces" (see buildNativeBounceUrl) to the app's custom URL scheme
// (com.dividosplit.app://splitwise-callback) that Android/iOS route back to
// MainActivity; @capacitor/app's `appUrlOpen` delivers that URL to JS.
//
// A signed, single-use `state` nonce (CSRF/mixup protection) is minted per
// attempt and stashed in sessionStorage; its `.w`/`.n` suffix also tells the
// callback page which of the two flows above is in progress.
// ─────────────────────────────────────────────────────────────────────────

const SPLITWISE_AUTHORIZE_URL = 'https://www.splitwise.com/oauth/authorize';
const NATIVE_URL_SCHEME = 'com.dividosplit.app';
const NATIVE_CALLBACK_HOST = 'splitwise-callback';
const OAUTH_STORAGE_KEY = 'divido_splitwise_oauth';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type OAuthPlatform = 'w' | 'n';

export type OAuthStateCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'mismatch' };

export interface SplitwiseCallbackResult {
  code: string | null;
  state: string | null;
  error: string | null;
}

export interface SplitwiseCurrentUser {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface SplitwiseGroupSummary {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface SplitwiseExpense {
  id: number;
  description?: string;
  cost?: string;
  date?: string;
  [key: string]: unknown;
}

export interface SplitwiseExchangeResult {
  accessToken: string;
  currentUser: SplitwiseCurrentUser;
  groups: SplitwiseGroupSummary[];
}

export interface SplitwiseExpensesResult {
  expenses: SplitwiseExpense[];
  truncated: boolean;
}

/** Base class for every typed error this module throws. */
export class SplitwiseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SplitwiseError';
  }
}

/** Thrown when startSplitwiseAuth() is called without a configured client id. */
export class SplitwiseConfigError extends SplitwiseError {
  constructor(message = 'Splitwise is not configured (missing VITE_SPLITWISE_CLIENT_ID)') {
    super(message);
    this.name = 'SplitwiseConfigError';
  }
}

/** Thrown when the splitwise-import Edge Function call fails or returns no data. */
export class SplitwiseApiError extends SplitwiseError {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'SplitwiseApiError';
  }
}

export function isSplitwiseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SPLITWISE_CLIENT_ID);
}

function getRedirectUri(): string {
  const configured = import.meta.env.VITE_SPLITWISE_REDIRECT_URI;
  if (configured) return configured;
  return `${window.location.origin}/splitwise-callback`;
}

function buildAuthorizeUrl(state: string): string {
  const clientId = import.meta.env.VITE_SPLITWISE_CLIENT_ID || '';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${SPLITWISE_AUTHORIZE_URL}?${params.toString()}`;
}

// Mirrors the crypto.randomUUID()-with-fallback convention used by
// genGroupId/genExpenseId in ./utils.ts.
function uuid(): string {
  return typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `sw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface StoredOAuthState {
  state: string;
  createdAt: number; // epoch ms
}

interface OAuthNonceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// In-memory fallback used only when the browser `sessionStorage` global is
// unavailable (Node unit tests, or a WebView that throws in private mode).
// Production always runs inside a browser/WebView where sessionStorage
// exists, so this is purely a safety net, never the primary store.
const memoryFallback = new Map<string, string>();
const memoryStorage: OAuthNonceStorage = {
  getItem: (key) => (memoryFallback.has(key) ? memoryFallback.get(key)! : null),
  setItem: (key, value) => { memoryFallback.set(key, value); },
  removeItem: (key) => { memoryFallback.delete(key); },
};

function getStorage(): OAuthNonceStorage {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // Referencing `sessionStorage` itself threw (no browser global at all).
  }
  return memoryStorage;
}

/** Generates and persists a single-use OAuth state nonce, returning it. */
export function beginOAuthState(platform: OAuthPlatform): string {
  const state = `${uuid()}.${platform}`;
  try {
    const payload: StoredOAuthState = { state, createdAt: Date.now() };
    getStorage().setItem(OAUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable/full — consumeOAuthState will fail closed below,
    // which the caller surfaces as a "please try again" error.
  }
  return state;
}

/**
 * Verifies a state returned by Splitwise against the one we minted.
 * Always consumes (deletes) the stored nonce on read, so a state can only
 * ever be verified once even if this is called twice for the same value.
 */
export function consumeOAuthState(returnedState: string | null | undefined): OAuthStateCheck {
  let stored: StoredOAuthState | null = null;
  try {
    const storage = getStorage();
    const raw = storage.getItem(OAUTH_STORAGE_KEY);
    storage.removeItem(OAUTH_STORAGE_KEY); // single-use, regardless of outcome below
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.state === 'string' && typeof parsed?.createdAt === 'number') {
        stored = parsed;
      }
    }
  } catch {
    stored = null;
  }

  if (!returnedState || !stored) return { ok: false, reason: 'missing' };
  if (Date.now() - stored.createdAt > OAUTH_STATE_TTL_MS) return { ok: false, reason: 'expired' };
  if (stored.state !== returnedState) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/** True when `state` was minted for the native (in-app-browser bounce) flow. */
export function isNativeBounce(state: string | null | undefined): boolean {
  if (!state) return false;
  return state.slice(state.lastIndexOf('.') + 1) === 'n';
}

/** Builds the custom-scheme URL the https callback page bounces to on native. */
export function buildNativeBounceUrl(code: string, state: string): string {
  const params = new URLSearchParams({ code, state });
  return `${NATIVE_URL_SCHEME}://${NATIVE_CALLBACK_HOST}?${params.toString()}`;
}

/** Extracts {code, state, error} from either an https or custom-scheme callback URL. */
export function parseCallback(url: string): SplitwiseCallbackResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    try {
      // Support a bare "?code=...&state=..." string (e.g. in tests).
      parsed = new URL(url, 'http://localhost');
    } catch {
      return { code: null, state: null, error: null };
    }
  }
  return {
    code: parsed.searchParams.get('code'),
    state: parsed.searchParams.get('state'),
    error: parsed.searchParams.get('error'),
  };
}

async function isRunningNatively(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Kicks off the Splitwise OAuth flow: native opens an in-app browser, web redirects the page. */
export async function startSplitwiseAuth(): Promise<void> {
  if (!isSplitwiseConfigured()) {
    throw new SplitwiseConfigError();
  }
  const native = await isRunningNatively();
  const state = beginOAuthState(native ? 'n' : 'w');
  const authorizeUrl = buildAuthorizeUrl(state);

  if (native) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: authorizeUrl });
  } else {
    window.location.assign(authorizeUrl);
  }
}

/**
 * Native-only: listens for the custom-scheme bounce (via @capacitor/app's
 * `appUrlOpen`), forwards the parsed {code,state,error} to `handler`, and
 * closes the in-app browser that's still showing the https callback page.
 * Returns an unsubscribe function. No-op (and never fires) on web.
 */
export function subscribeNativeCallback(handler: (result: SplitwiseCallbackResult) => void): () => void {
  let listenerHandle: { remove: () => void } | null = null;
  let unsubscribed = false;

  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      if (unsubscribed) return;
      listenerHandle = await App.addListener('appUrlOpen', ({ url }) => {
        handler(parseCallback(url));
        import('@capacitor/browser')
          .then(({ Browser }) => Browser.close())
          .catch(() => {
            // No in-app browser session left to close — ignore.
          });
      });
    } catch {
      // @capacitor/app unavailable (web platform) — nothing to subscribe to.
    }
  })();

  return () => {
    unsubscribed = true;
    listenerHandle?.remove();
  };
}

async function invokeSplitwiseImport<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('splitwise-import', { body });
  if (error) {
    throw new SplitwiseApiError(error.message || 'Splitwise import request failed', error);
  }
  if (!data) {
    throw new SplitwiseApiError('Splitwise import request returned no data');
  }
  return data;
}

/** Exchanges an OAuth `code` for an access token. The token is returned to the caller, never stored here. */
export async function exchangeCode(code: string): Promise<SplitwiseExchangeResult> {
  return invokeSplitwiseImport<SplitwiseExchangeResult>({
    action: 'exchange',
    code,
    redirectUri: getRedirectUri(),
  });
}

export async function fetchGroupExpenses(accessToken: string, groupId: string | number): Promise<SplitwiseExpensesResult> {
  return invokeSplitwiseImport<SplitwiseExpensesResult>({
    action: 'expenses',
    accessToken,
    groupId,
  });
}

export async function fetchFriendExpenses(accessToken: string): Promise<SplitwiseExpensesResult> {
  return invokeSplitwiseImport<SplitwiseExpensesResult>({
    action: 'friendExpenses',
    accessToken,
  });
}

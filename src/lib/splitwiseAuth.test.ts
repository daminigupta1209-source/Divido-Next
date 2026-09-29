import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  beginOAuthState,
  consumeOAuthState,
  isNativeBounce,
  parseCallback,
  buildNativeBounceUrl,
} from './splitwiseAuth';

// These tests exercise only the pure, storage-backed helpers (no @capacitor
// imports are touched by beginOAuthState/consumeOAuthState/parseCallback/
// isNativeBounce/buildNativeBounceUrl), so they run under plain Node/vitest.

describe('OAuth state nonce (begin/consume)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips: a freshly minted state verifies ok', () => {
    const state = beginOAuthState('w');
    expect(consumeOAuthState(state)).toEqual({ ok: true });
  });

  it('encodes the platform as a "<uuid>.<w|n>" suffix', () => {
    const webState = beginOAuthState('w');
    const nativeState = beginOAuthState('n');
    expect(webState.endsWith('.w')).toBe(true);
    expect(nativeState.endsWith('.n')).toBe(true);
    expect(isNativeBounce(webState)).toBe(false);
    expect(isNativeBounce(nativeState)).toBe(true);
  });

  it('is single-use: a second verification of the same state fails as missing', () => {
    const state = beginOAuthState('w');
    expect(consumeOAuthState(state)).toEqual({ ok: true });
    expect(consumeOAuthState(state)).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects a state that does not match what was stored', () => {
    beginOAuthState('w');
    expect(consumeOAuthState('some-other-state.w')).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a state after the 10-minute expiry window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const state = beginOAuthState('w');

    vi.setSystemTime(new Date('2026-01-01T00:10:01Z')); // 10min 1s later
    expect(consumeOAuthState(state)).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts a state right up to (but not over) the expiry window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const state = beginOAuthState('w');

    vi.setSystemTime(new Date('2026-01-01T00:09:59Z')); // 9min 59s later
    expect(consumeOAuthState(state)).toEqual({ ok: true });
  });

  it('rejects when nothing was ever stored', () => {
    expect(consumeOAuthState('never-stored.w')).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects a null/undefined returned state', () => {
    beginOAuthState('w');
    expect(consumeOAuthState(null)).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('parseCallback', () => {
  it('extracts code/state/error from a full https callback URL', () => {
    const url = 'https://app.example.com/splitwise-callback?code=abc123&state=uuid-1.w';
    expect(parseCallback(url)).toEqual({ code: 'abc123', state: 'uuid-1.w', error: null });
  });

  it('extracts code/state from a native custom-scheme bounce URL', () => {
    const url = 'com.dividosplit.app://splitwise-callback?code=xyz789&state=uuid-2.n';
    expect(parseCallback(url)).toEqual({ code: 'xyz789', state: 'uuid-2.n', error: null });
  });

  it('surfaces an OAuth error param (e.g. user denied access)', () => {
    const url = 'https://app.example.com/splitwise-callback?error=access_denied&state=uuid-3.w';
    expect(parseCallback(url)).toEqual({ code: null, state: 'uuid-3.w', error: 'access_denied' });
  });

  it('handles a bare query string without a scheme/host', () => {
    expect(parseCallback('?code=abc&state=uuid-4.w')).toEqual({ code: 'abc', state: 'uuid-4.w', error: null });
  });
});

describe('buildNativeBounceUrl', () => {
  it('builds the custom-scheme URL the callback page redirects to on native', () => {
    expect(buildNativeBounceUrl('code123', 'uuid-5.n')).toBe(
      'com.dividosplit.app://splitwise-callback?code=code123&state=uuid-5.n'
    );
  });

  it('percent-encodes special characters in code/state', () => {
    const url = buildNativeBounceUrl('a b+c', 'uuid&6.n');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('code')).toBe('a b+c');
    expect(parsed.searchParams.get('state')).toBe('uuid&6.n');
  });
});

import { create } from 'zustand';
import type { Dispatch, SetStateAction } from 'react';

// Phase 2 of the App.tsx state migration: the derived-balance container.
//
// This holds ONLY the raw output of the canonical balance engine
// (asyncBatchNetBalances, run in a web worker) — a plain state box, moved here
// so consumers can eventually read it via selectors (Phase 3). The money math
// itself is untouched:
//   - The worker EFFECT that fills this stays in App.tsx; it just calls
//     setAllGroupBalances below instead of a local useState setter.
//   - getMemberBalance (the identity-aware read that merges name-buckets via
//     getPersonKey) also stays in App.tsx for now; it simply reads this value.
// So the single-source-of-truth engine and the identity keying are exactly as
// before — we only relocated the container.
//
// Setter mirrors React's useState contract (value OR prev=>next) with stable
// identity, matching Phase 1's ledger store.

// group id -> member name -> currency -> signed amount
export type AllGroupBalances = Record<string, Record<string, Record<string, number>>>;

const resolve = <T>(action: SetStateAction<T>, prev: T): T =>
  typeof action === 'function' ? (action as (p: T) => T)(prev) : action;

interface BalanceState {
  allGroupBalances: AllGroupBalances;
  setAllGroupBalances: Dispatch<SetStateAction<AllGroupBalances>>;
}

export const useBalanceStore = create<BalanceState>((set) => ({
  allGroupBalances: {},
  setAllGroupBalances: (action) =>
    set((s) => ({ allGroupBalances: resolve(action, s.allGroupBalances) })),
}));

import { create } from 'zustand';
import type { Dispatch, SetStateAction } from 'react';
import { Group, Expense } from '../lib/types';
import { ensureArray, ensureObject, isLegacyRenameLog } from '../lib/utils';

// Phase 1 of the App.tsx state migration: the core ledger slice — groups,
// expenses, and the currently selected group id. This is the risky slice
// because useSupabaseSync (App.tsx ~2119) takes these setters as arguments and
// calls them with BOTH direct values and functional updaters, and keeps them in
// its dependency arrays. So the setters below deliberately mirror React's
// useState setter contract exactly:
//   - signature is Dispatch<SetStateAction<T>> (value OR (prev) => next)
//   - identity is stable (Zustand store methods are created once), matching the
//     stable reference useState setters gave — safe in the hook's dep arrays.
// The sync hook stays 100% untouched.

// --- Initializers: moved verbatim from the previous inline useState(() => …)
// blocks so persisted-load behaviour is byte-for-byte identical. ---

function readInitialGroups(): Group[] {
  try {
    const saved = localStorage.getItem('divido_groups');
    const savedName = localStorage.getItem('divido_username');
    const dName = savedName && savedName !== 'undefined' ? savedName : 'You';
    const myFirstName = dName.split(' ')[0];
    const parsed = saved && saved !== 'undefined' ? JSON.parse(saved) : [];
    const seenIds = new Set<any>();
    const uniqueParsed = parsed.filter((g: any) => {
      if (!g.id) return false;
      // Group ids are permanent and unique — dedupe by id regardless of type.
      if (seenIds.has(String(g.id))) return false;
      seenIds.add(String(g.id));
      return true;
    });
    return uniqueParsed.map((g: any) => {
      const members = Array.isArray(g.members) ? Array.from(new Set(g.members)) : [myFirstName || 'You'];
      return {
        ...g,
        members,
        currency: g.currency || '₹',
        simplifyDebts: g.simplifyDebts !== undefined ? g.simplifyDebts : false,
      };
    }) as Group[];
  } catch (e) {
    return [];
  }
}

function readInitialExpenses(): Expense[] {
  try {
    const saved = localStorage.getItem('divido_expenses');
    const parsed = saved && saved !== 'undefined' ? JSON.parse(saved) : [];
    return parsed.filter((e: any) => !isLegacyRenameLog(e)).map((e: any) => {
      const splitters = ensureArray(e.splitters);
      const shares = ensureObject(e.shares);
      return { ...e, splitters, shares, amt: parseFloat(e.amt) || 0 };
    }) as Expense[];
  } catch (e) {
    return [];
  }
}

// selectedId is seeded from the existing UI-state blob (history.state /
// sessionStorage 'divido_ui_state'), NOT a dedicated key. We only READ it here;
// App.tsx keeps owning the UI-state persistence path exactly as before, so
// nothing about how selectedId is saved changes.
function readInitialSelectedId(): string | number | null {
  try {
    const st = window.history.state;
    if (st && st._divido && st.uiState) {
      return st.uiState.selectedId ?? null;
    }
    const saved = sessionStorage.getItem('divido_ui_state');
    if (saved) {
      return JSON.parse(saved).selectedId ?? null;
    }
  } catch {}
  return null;
}

// Resolve a React SetStateAction<T> against the current value, so the setters
// accept both `set(value)` and `set(prev => next)` identically to useState.
const resolve = <T>(action: SetStateAction<T>, prev: T): T =>
  typeof action === 'function' ? (action as (p: T) => T)(prev) : action;

interface LedgerState {
  groups: Group[];
  expenses: Expense[];
  selectedId: string | number | null;
  setGroups: Dispatch<SetStateAction<Group[]>>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setSelectedId: Dispatch<SetStateAction<string | number | null>>;
}

export const useLedgerStore = create<LedgerState>((set) => ({
  groups: readInitialGroups(),
  expenses: readInitialExpenses(),
  selectedId: readInitialSelectedId(),
  setGroups: (action) => set((s) => ({ groups: resolve(action, s.groups) })),
  setExpenses: (action) => set((s) => ({ expenses: resolve(action, s.expenses) })),
  setSelectedId: (action) => set((s) => ({ selectedId: resolve(action, s.selectedId) })),
}));

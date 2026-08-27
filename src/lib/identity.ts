import { Group, Expense } from './types';
import {
  SimplifiedTransaction,
  simplifyMultiCurrencyDebts,
  computeRawPairwiseTransactions,
} from './calculations';

// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for resolving a member's DISPLAY NAME to a stable,
// rename-safe KEY within a group.
//
// Today people are matched to expenses/balances by their raw name string,
// which is fragile: rename someone and every copy of the name must be rewritten
// or balances orphan. This helper is the first step toward keying by a stable
// identity instead. The key priority is:
//   1. group.memberIdentities[name]          — the recorded identity
//      (lower(email) for signed-in members → person_id for name-only members),
//      built at load in useSupabaseSync from the group_members rows.
//   2. group.memberIdentities[name + ' (Left)'] — same, for a member who has
//      left (their roster entry carries the "(Left)" suffix).
//   3. the raw name itself — legacy / unlinked members keep the old
//      match-by-name behaviour, so nothing regresses.
//
// Every balance-bucketing caller should use THIS function rather than reaching
// into memberIdentities inline, so the resolution rule lives in one place.
// ─────────────────────────────────────────────────────────────────────────
export const getPersonKey = (group: Group | undefined | null, name: string): string => {
  const mi = group?.memberIdentities;
  if (!mi) return name;
  // Fast path: exact match, then the "(Left)" variant.
  if (mi[name]) return mi[name];
  if (mi[name + ' (Left)']) return mi[name + ' (Left)'];
  // Case-insensitive fallback: expenses can spell a name differently from the
  // roster ("didi" in one expense, "Didi" on the member row). Without this they
  // resolve to different keys and the same person shows up twice. Match by the
  // lower-cased, suffix-stripped name against every identity entry.
  const target = name.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
  for (const k of Object.keys(mi)) {
    if (k.replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === target) return mi[k];
  }
  return name;
};

// Strip the "(Left)" / "(me)" display suffixes to get the bare name. Kept here
// next to getPersonKey because both are about turning a raw member string into
// something comparable; callers that need the plain name for display use this.
export const cleanMemberName = (name: string): string =>
  name.replace(/\s*\((Left|me)\)\s*$/i, '').trim();

const isLeftName = (name: string): boolean => /\s*\(Left\)\s*$/i.test(name);

// Pick the display name to show for each identity key in a group. Prefers a
// current (non-"(Left)") roster name so a person who has both a live and a
// left entry shows under their live name; falls back to a left name, then the
// key itself.
export const buildKeyToName = (group: Group): Record<string, string> => {
  const keyToName: Record<string, string> = {};
  const hasLive: Record<string, boolean> = {};
  (group?.members || []).forEach((m) => {
    const key = getPersonKey(group, m);
    const left = isLeftName(m);
    if (!(key in keyToName) || (!left && !hasLive[key])) {
      keyToName[key] = cleanMemberName(m);
      if (!left) hasLive[key] = true;
    }
  });
  return keyToName;
};

// Rewrite a group's expenses from NAME-space into identity-KEY-space: paid,
// splitters, and share keys are all replaced by their stable person key
// (getPersonKey). This is what lets the balance engine collapse different
// display names for the same person (e.g. "Ram" and "Ram (Left)") into one
// ledger entry. Names with no recorded identity fall back to themselves, so
// legacy/phantom members behave exactly as before.
export const toIdentitySpace = (
  group: Group,
  expenses: Expense[],
): { memberKeys: string[]; expenses: Expense[]; keyToName: Record<string, string> } => {
  const keyToName = buildKeyToName(group);
  const remap = (nm: string) => getPersonKey(group, nm);
  const memberKeys = Array.from(new Set((group?.members || []).map(remap)));

  const rekeyed = expenses.map((e) => {
    const paid = e.paid ? remap(e.paid) : e.paid;
    const splitters = (e.splitters || []).map(remap);
    let shares = e.shares;
    if (e.shares) {
      const next: Record<string, number> = {};
      Object.entries(e.shares).forEach(([nm, v]) => {
        const k = remap(nm);
        // Sum on the rare collision of two variant names for one person.
        next[k] = (Number(next[k]) || 0) + (Number(v) || 0);
      });
      shares = next;
    }
    return { ...e, paid, splitters, shares };
  });

  // Any key that appears only in expenses (a name not on the roster) displays
  // as itself, matching today's phantom-by-name behaviour.
  rekeyed.forEach((e) => {
    if (e.paid && !(e.paid in keyToName)) keyToName[e.paid] = e.paid;
    (e.splitters || []).forEach((k) => { if (!(k in keyToName)) keyToName[k] = k; });
  });

  return { memberKeys, expenses: rekeyed, keyToName };
};

// Compute balances for a group in identity-space, then translate the result
// back to display names. Same output shape as the raw engine, but with
// same-person name variants merged. `simplify` selects the simplified vs. raw
// pairwise engine (mirrors selectedGroup.simplifyDebts).
export const balancesByIdentity = (
  group: Group,
  expenses: Expense[],
  simplify: boolean,
): SimplifiedTransaction[] => {
  const { memberKeys, expenses: nx, keyToName } = toIdentitySpace(group, expenses);
  const engine = simplify ? simplifyMultiCurrencyDebts : computeRawPairwiseTransactions;
  return engine(memberKeys, nx, group?.currency || '₹').map((t) => ({
    ...t,
    from: keyToName[t.from] ?? t.from,
    to: keyToName[t.to] ?? t.to,
  }));
};

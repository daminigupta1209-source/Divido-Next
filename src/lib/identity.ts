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
// A light email format check — enough to reject obvious junk ("hello", "a@@b")
// without rejecting valid-but-unusual real addresses. Not a deliverability check.
export const isValidEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

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

// Build the "people you've split with before" suggestion list for the add-friend
// UIs: everyone from your OTHER groups who isn't already in the current group.
//
// Dedup rule (important): people who joined with Google are keyed by EMAIL, so
// two different people who share a name stay separate (distinguishable by their
// email). But name-only members get a fresh hidden person_id in every group, so
// the same "didi" across groups would otherwise appear many times. So we collapse
// all name-only entries that share a name into ONE, and drop a name-only entry
// entirely when an email-bearing entry for that same name exists (same person,
// now identified).
export const buildPeopleSuggestions = (
  groups: Group[],
  currentGroupId: string | number | null,
  currentMembers: string[],
  me: string,
  myEmail?: string,
): { name: string; email: string; identity: string }[] => {
  const meLower = (me || '').replace(/\s*\((me|you|left)\)$/i, '').trim().toLowerCase();
  // Also exclude MYSELF by identity/email, not just by name: across other groups
  // I may be listed under a slightly different name than `me`, so a name-only
  // filter lets me leak into my own suggestions (and lets me add myself).
  const myEmailLower = (myEmail || '').trim().toLowerCase();
  const curMembers = new Set((currentMembers || []).map((m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase()));
  // Collect one raw entry per (group member): name + their stable identity
  // (email OR person_id) from that group's memberIdentities.
  const raw: { name: string; email: string; identity: string }[] = [];
  for (const g of groups || []) {
    if (!g || g.id === 'STANDALONE' || String(g.id) === String(currentGroupId)) continue;
    const mi = g.memberIdentities || {};
    for (const m of g.members || []) {
      const clean = m.replace(/\s*\(Left\)$/i, '').trim();
      const lower = clean.toLowerCase();
      if (!clean || lower === meLower || curMembers.has(lower)) continue;
      const identity = typeof mi[m] === 'string' ? mi[m] : '';
      // Skip my own account no matter what name it wears in another group.
      if (myEmailLower && identity.toLowerCase() === myEmailLower) continue;
      raw.push({ name: clean, email: identity.includes('@') ? identity : '', identity });
    }
  }
  // Group by lowercased name; within a name, emit one row per distinct email,
  // plus a single name-only row only when that name has no email at all. Each
  // row carries an `identity` (email, or a name-only person's person_id) so the
  // picker can REUSE that person's stable id instead of minting a new one — this
  // is what stops the same name-only friend becoming duplicate people per group.
  const byName = new Map<string, { name: string; emails: Set<string>; nameOnly: boolean; nameOnlyId: string }>();
  for (const r of raw) {
    const k = r.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, { name: r.name, emails: new Set(), nameOnly: false, nameOnlyId: '' });
    const e = byName.get(k)!;
    if (r.email) e.emails.add(r.email.toLowerCase());
    else { e.nameOnly = true; if (!e.nameOnlyId && r.identity && !r.identity.includes('@')) e.nameOnlyId = r.identity; }
  }
  const out: { name: string; email: string; identity: string }[] = [];
  for (const e of byName.values()) {
    if (e.emails.size > 0) {
      for (const em of e.emails) out.push({ name: e.name, email: em, identity: em });
    } else if (e.nameOnly) {
      out.push({ name: e.name, email: '', identity: e.nameOnlyId });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

// ─────────────────────────────────────────────────────────────────────────
// Duplicate-person detection for the "Merge people" tool.
//
// The same real person can end up with DIFFERENT identity keys across groups —
// most often after they delete their account (their email is dropped, so each
// group falls back to a per-group person_id) — which makes them show up as
// several separate people in balances/suggestions. This finds names that
// resolve to 2+ distinct identities so the user can review and merge them.
// It only SUGGESTS by matching name; the user confirms, because two genuinely
// different people can share a name.
// ─────────────────────────────────────────────────────────────────────────
export interface DuplicateEntry {
  groupId: string | number;
  groupName: string;
  memberName: string; // exact roster string (may end in " (Left)")
  identity: string;
  email: string;
}
export interface DuplicatePerson {
  name: string;
  entries: DuplicateEntry[];
}

export const findDuplicatePeople = (groups: Group[], me: string): DuplicatePerson[] => {
  const meLower = (me || '').replace(/\s*\((me|you|left)\)$/i, '').trim().toLowerCase();
  const byName = new Map<string, DuplicateEntry[]>();
  for (const g of groups || []) {
    if (!g || g.id === 'STANDALONE') continue;
    const mi = g.memberIdentities || {};
    for (const m of g.members || []) {
      const clean = m.replace(/\s*\(Left\)$/i, '').trim();
      const lower = clean.toLowerCase();
      if (!clean || lower === meLower) continue;
      const identity = typeof mi[m] === 'string' && mi[m] ? mi[m] : clean;
      if (!byName.has(lower)) byName.set(lower, []);
      byName.get(lower)!.push({
        groupId: g.id,
        groupName: g.name,
        memberName: m,
        identity,
        email: identity.includes('@') ? identity : '',
      });
    }
  }
  const out: DuplicatePerson[] = [];
  for (const entries of byName.values()) {
    const distinct = new Set(entries.map((e) => e.identity.toLowerCase()));
    if (distinct.size >= 2) {
      out.push({ name: entries[0].memberName.replace(/\s*\(Left\)$/i, '').trim(), entries });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

// Pick the identity all merged rows should share: prefer a real email, then an
// existing hidden person_id, else mint a stable merged id.
export const pickCanonicalIdentity = (entries: DuplicateEntry[]): string => {
  const email = entries.map((e) => e.identity).find((id) => id.includes('@'));
  if (email) return email.toLowerCase();
  const pid = entries.map((e) => e.identity).find((id) => id && !id.includes('@'));
  return pid || `merged-${Date.now()}`;
};

// Strip the "(Left)" / "(me)" display suffixes to get the bare name. Kept here
// next to getPersonKey because both are about turning a raw member string into
// something comparable; callers that need the plain name for display use this.
export const cleanMemberName = (name: string): string =>
  name.replace(/\s*\((left|me|you)\)\s*$/i, '').trim();

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

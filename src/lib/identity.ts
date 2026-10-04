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

// Snap a name to a group's exact roster spelling so one person can't fragment
// into several name-buckets. Matches, in order: exact (case-insensitive), then
// an unambiguous first-name token (flat "Damini" -> roster "Damini Gupta", only
// when exactly one member starts with it). Returns the name unchanged when there
// is no roster or no confident match.
export const canonicalRosterName = (name: string, roster: string[]): string => {
  if (!name || !roster || roster.length === 0) return name;
  const clean = (m: string) => m.replace(/\s*\(Left\)$/i, '').trim();
  const target = clean(name).toLowerCase();
  let match = roster.find((m) => clean(m).toLowerCase() === target);
  if (!match) {
    const firstTok = roster.filter((m) => clean(m).toLowerCase().split(' ')[0] === target);
    if (firstTok.length === 1) match = firstTok[0];
  }
  return match ? clean(match) : name;
};

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

// Resolve the CURRENT USER's stable identity key within a group.
//
// Why this exists: the app knows the user by a short display name (App derives
// `me` as userName.split(' ')[0] → "Damini"), but the user can be enrolled under
// a different spelling in a given group ("Damini Gupta"). Matching by a single
// name is fragile — when it misses, every transaction in that group is dropped
// and people vanish from All balances. This resolves the user robustly by trying,
// in order:
//   1. signed-in email — stable across ALL groups, so preferred whenever the
//      group carries it as a member identity;
//   2. per-group claim (divido_identity_<gid>), full username, then first name —
//      whichever first resolves (via getPersonKey) to a REAL identity value that
//      exists in this group's memberIdentities.
// Falls back to getPersonKey(group, claim || firstName) so behaviour never
// regresses for groups that carry none of these.
export const resolveSelfKey = (
  group: Group | undefined | null,
  ids: { email?: string; fullName?: string; firstName?: string; claim?: string }
): string => {
  const email = (ids.email || '').toLowerCase();
  const groupKeyVals = new Set(
    Object.values(group?.memberIdentities || {}).map((v) => String(v).toLowerCase())
  );
  if (email && groupKeyVals.has(email)) return email;
  for (const nm of [ids.fullName, ids.firstName, ids.claim]) {
    if (!nm) continue;
    const k = getPersonKey(group, nm);
    if (groupKeyVals.has(String(k).toLowerCase())) return k;
  }
  return getPersonKey(group, ids.claim || ids.firstName || '');
};

// Build a resolver mapping a display name to that person's EMAIL identity, drawn
// from every group's memberIdentities. Non-Group (standalone) expenses carry no
// per-group identity map, so a person there is keyed by raw name and shows up as
// a SEPARATE duplicate of their in-group (email-keyed) self — which then flickers
// in/out as standalone data syncs. Resolving standalone names through this map
// merges them into one person.
//
// Safety: only a name that maps to EXACTLY ONE email across all groups resolves;
// a name seen with two different emails is ambiguous (two real people share it)
// and returns undefined, so distinct people are never wrongly merged.
export const buildNameEmailResolver = (
  groups: Array<Group | undefined | null>
): ((name: string) => string | undefined) => {
  const map: Record<string, string> = {};
  const ambiguous = new Set<string>();
  const norm = (s: string) => s.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
  for (const g of groups) {
    const mi = g?.memberIdentities || {};
    for (const [nm, id] of Object.entries(mi)) {
      const email = String(id).toLowerCase();
      if (!email.includes('@')) continue;
      const key = norm(nm);
      if (!key) continue;
      if (map[key] && map[key] !== email) ambiguous.add(key);
      else map[key] = email;
    }
  }
  return (name: string) => {
    const key = norm(name);
    if (ambiguous.has(key)) return undefined;
    return map[key];
  };
};

// Look up a person's UPI ID, anchored on their EMAIL identity — NOT on their raw
// display name. UPI is real money: two same-named people keyed by name would
// clobber each other, and the payer could autofill the WRONG person's UPI. Synced
// UPIs (from group_members) are stored in userMetadata under the owner's
// lowercased email key; `nameToEmail` (buildNameEmailResolver, or a getPersonKey
// wrapper) turns the display name into that email — and only when it's
// unambiguous. Falls back to the name-keyed value (your own UPI, or a locally
// linked one) when no email resolves, so nothing regresses.
export const upiFor = (
  userMetadata: Record<string, any> | undefined | null,
  nameToEmail: (name: string) => string | undefined,
  name: string
): string | undefined => {
  const md = userMetadata || {};
  const email = nameToEmail(name);
  if (email) {
    const byEmail = md[email.toLowerCase()]?.upiId;
    if (byEmail) return byEmail;
  }
  return md[name]?.upiId;
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
// ── Dismissed recents ──────────────────────────────────────────────────────
// The "Recently split with" quick-pick list can get cluttered with people you
// no longer split with. Users can remove a row (trash icon); we remember those
// dismissals per-device in localStorage so they don't come back. A dismissal is
// keyed by the person's stable identity (email / person_id) when known, else by
// their normalized name. Dismissing only hides them from suggestions — it never
// touches groups, expenses or balances, and they can still be re-added by name.
const DISMISSED_PEOPLE_KEY = 'dividoDismissedPeople';

export const dismissedPersonKey = (s: { name: string; identity?: string; email?: string }): string => {
  const id = (s.identity || s.email || '').trim().toLowerCase();
  if (id) return id;
  return (s.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
};

let syncedDismissedPeople: string[] = [];
export const setSyncedDismissedPeople = (ppl: string[]) => { syncedDismissedPeople = ppl; };
export const getDismissedPeople = (): string[] => syncedDismissedPeople;

export const dismissPerson = (s: { name: string; identity?: string; email?: string }): void => {
  const key = dismissedPersonKey(s);
  if (!syncedDismissedPeople.includes(key)) {
    syncedDismissedPeople = [...syncedDismissedPeople, key];
    window.dispatchEvent(new CustomEvent('divido-dismiss-person', { detail: key }));
  }
};

export const buildPeopleSuggestions = (
  groups: Group[],
  currentGroupId: string | number | null,
  currentMembers: string[],
  me: string,
  myEmail?: string,
  dismissedPeople: string[] = [],
): { name: string; email: string; identity: string; pastMember?: boolean }[] => {
  const meLower = (me || '').replace(/\s*\((me|you|left)\)$/i, '').trim().toLowerCase();
  // Also exclude MYSELF by identity/email, not just by name: across other groups
  // I may be listed under a slightly different name than `me`, so a name-only
  // filter lets me leak into my own suggestions (and lets me add myself).
  const myEmailLower = (myEmail || '').trim().toLowerCase();
  // Only the CURRENTLY-active members are off-limits. A member who LEFT the
  // current group is intentionally offered again (as a "re-invite") below.
  const curActive = new Set(
    (currentMembers || [])
      .filter((m) => !/\s*\(Left\)$/i.test(m))
      .map((m) => m.trim().toLowerCase())
  );
  // Collect one raw entry per (group member): name + their stable identity
  // (email OR person_id) from that group's memberIdentities.
  const raw: { name: string; email: string; identity: string; past: boolean }[] = [];
  for (const g of groups || []) {
    if (!g || g.id === 'STANDALONE') continue;
    const isCurrent = String(g.id) === String(currentGroupId);
    const mi = g.memberIdentities || {};
    for (const m of g.members || []) {
      const isLeft = /\s*\(Left\)$/i.test(m);
      // Current group: surface ONLY past (left) members here — its active
      // members are already in the group. Other groups: everyone as before.
      if (isCurrent && !isLeft) continue;
      const clean = m.replace(/\s*\(Left\)$/i, '').trim();
      const lower = clean.toLowerCase();
      if (!clean || lower === meLower || curActive.has(lower)) continue;
      const identity = (typeof mi[m] === 'string' && mi[m]) ? mi[m] : (typeof mi[clean] === 'string' ? mi[clean] : '');
      // Skip my own account no matter what name it wears in another group.
      if (myEmailLower && identity.toLowerCase() === myEmailLower) continue;
      raw.push({ name: clean, email: identity.includes('@') ? identity : '', identity, past: isCurrent && isLeft });
    }
  }
  // Group by lowercased name; within a name, emit one row per distinct email,
  // plus a single name-only row only when that name has no email at all. Each
  // row carries an `identity` (email, or a name-only person's person_id) so the
  // picker can REUSE that person's stable id instead of minting a new one — this
  // is what stops the same name-only friend becoming duplicate people per group.
  // Normalize the merge key so "Vandana Investment", "vandana  investment" and
  // the like collapse to ONE person — otherwise the same friend can appear both
  // with their email (active elsewhere) and struck-through (past member here).
  const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const byName = new Map<string, { name: string; emails: Set<string>; nameOnly: boolean; nameOnlyId: string; seenPast: boolean; nonPast: boolean }>();
  for (const r of raw) {
    const k = nameKey(r.name);
    if (!byName.has(k)) byName.set(k, { name: r.name, emails: new Set(), nameOnly: false, nameOnlyId: '', seenPast: false, nonPast: false });
    const e = byName.get(k)!;
    if (r.email) e.emails.add(r.email.toLowerCase());
    else { e.nameOnly = true; if (!e.nameOnlyId && r.identity && !r.identity.includes('@')) e.nameOnlyId = r.identity; }
    if (r.past) e.seenPast = true; else e.nonPast = true;
  }
  const out: { name: string; email: string; identity: string; pastMember?: boolean }[] = [];
  for (const e of byName.values()) {
    // Struck-through when they LEFT the current group — regardless of being
    // active elsewhere — so it's clear picking them re-invites them here. (A
    // current-group active member is excluded from suggestions entirely.)
    const pastMember = e.seenPast;
    if (e.emails.size > 0) {
      for (const em of e.emails) out.push({ name: e.name, email: em, identity: em, pastMember });
    } else if (e.nameOnly) {
      out.push({ name: e.name, email: '', identity: e.nameOnlyId, pastMember });
    }
  }
  const dismissed = new Set(dismissedPeople);
  // Match people by EMAIL, not just name: someone already active in this group
  // (even under another spelling or a hidden email tag) is never suggested,
  // and one email listed under two names ("Esha", "Esha Gupta") shows once,
  // under the longer (fuller) name.
  const cur = (groups || []).find((g) => g && String(g.id) === String(currentGroupId));
  const curEmails = new Set<string>();
  if (cur) {
    const mi = cur.memberIdentities || {};
    (cur.members || []).forEach((m) => {
      if (/\s*\(Left\)$/i.test(m)) return;
      const id = String(mi[m] || '').toLowerCase();
      if (id.includes('@')) curEmails.add(id);
    });
  }
  const byEmail = new Map<string, (typeof out)[number]>();
  const result: typeof out = [];
  for (const s of out) {
    const em = s.email.toLowerCase();
    if (!em) { result.push(s); continue; }
    if (curEmails.has(em)) continue;
    const prev = byEmail.get(em);
    if (!prev) { byEmail.set(em, s); result.push(s); continue; }
    if (s.name.length > prev.name.length) { result[result.indexOf(prev)] = s; byEmail.set(em, s); }
  }
  return result
    .filter((s) => !dismissed.has(dismissedPersonKey(s)))
    .sort((a, b) => a.name.localeCompare(b.name));
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
      // Compare the name people SEE: drop "(Left)" and the hidden email tag
      // ("Esha Gupta (esha1997)" is the same name as "Esha Gupta").
      const clean = withoutEmailTag(g, m).replace(/\s*\(Left\)$/i, '').trim();
      const lower = clean.toLowerCase();
      if (!clean || lower === meLower) continue;
      const identity = typeof mi[m] === 'string' && mi[m] ? mi[m] : clean;
      if (!byName.has(lower)) byName.set(lower, []);
      byName.get(lower)!.push({
        groupId: g.id,
        // Shared 2-person threads are shown as Non-Group everywhere.
        groupName: (g as any).isDirect ? 'Non-Group' : g.name,
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
      const first = entries[0];
      const g0 = (groups || []).find((g) => g && String(g.id) === String(first.groupId));
      out.push({ name: withoutEmailTag(g0, first.memberName).replace(/\s*\(Left\)$/i, '').trim(), entries });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

// Find groups that are almost certainly accidental duplicates of each other —
// created when two devices made the "same" group at the same moment. To avoid
// flagging two LEGITIMATELY distinct same-named groups (a user can have two
// "Trip"s with different people), a cluster requires BOTH the same name AND the
// same member set. Direct (isDirect) threads and STANDALONE are never included.
// Returns clusters of 2+; the caller prompts the user to merge (never auto).
export const findDuplicateGroups = (groups: Group[]): { name: string; groups: Group[] }[] => {
  const memberSig = (g: Group) =>
    (g.members || [])
      .map((m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|');
  const byKey = new Map<string, Group[]>();
  for (const g of groups || []) {
    if (!g || String(g.id) === 'STANDALONE' || (g as { isDirect?: boolean }).isDirect) continue;
    const name = (g.name || '').trim();
    if (!name) continue;
    const key = `${name.toLowerCase()}\x1f${memberSig(g)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(g);
  }
  const out: { name: string; groups: Group[] }[] = [];
  for (const gs of byKey.values()) {
    if (gs.length >= 2) out.push({ name: gs[0].name, groups: gs });
  }
  return out;
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

// group_members rows to build a roster from, minus any "(Left)" row whose
// person is back under the same name on a live row (a rejoin through a new
// spot keeps the old row, only flagged is_removed). Left in, that person was
// "Joined" and "Left" at once: the left banner, the view-only guard and the
// Left tab all fired while they were active. Same name only, so balances are
// unchanged (expenses store the bare name the live row already covers).
// Whether I'm only a past member of this group: a "(Left)" roster entry under
// my name and no live one. A live entry wins, so stale state holding both
// never shows the left banner or locks me into view-only.
export const isPastMemberOf = (group: Pick<Group, 'members'> | null | undefined, me: string): boolean => {
  const cleanMe = cleanMemberName(me || '').toLowerCase();
  if (!cleanMe || !group?.members) return false;
  const mine = group.members.filter((m) => cleanMemberName(m).toLowerCase() === cleanMe);
  return mine.some(isLeftName) && !mine.some((m) => !isLeftName(m));
};

export const dropShadowedLeftRows =<T extends { name?: string | null }>(rows: T[]): T[] => {
  const base = (r: T) => cleanMemberName(String(r.name || '')).toLowerCase();
  const live = new Set(rows.filter((r) => !isLeftName(String(r.name || ''))).map(base));
  return rows.filter((r) => !isLeftName(String(r.name || '')) || !live.has(base(r)));
};

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
  const byName = (nm: string) => getPersonKey(group, nm);
  const memberKeys = Array.from(new Set((group?.members || []).map(byName)));

  // member_key → that row's CURRENT identity (email / person_id / name).
  const identityOfKey: Record<string, string> = {};
  Object.entries(group?.memberKeys || {}).forEach(([disp, mk]) => {
    if (!(mk in identityOfKey)) identityOfKey[mk] = byName(disp);
  });

  const rekeyed = expenses.map((e) => {
    // Prefer the member row the expense recorded for this name (survives
    // renames, claims with a different email, "(Left)"); fall back to
    // matching the name against the roster, as before.
    const pk: Record<string, string> = {};
    Object.entries(e.partyKeys || {}).forEach(([n, k]) => { pk[n.trim().toLowerCase()] = k; });
    const remap = (nm: string) => {
      const mk = pk[String(nm).trim().toLowerCase()];
      return (mk && identityOfKey[mk]) || byName(nm);
    };
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

// ── Member keys (balances by person, not by name) ───────────────────────────
// Each group_members row has a permanent member_key (api/add_member_key.sql)
// that never changes on claim, rename, "(Left)", email change or merge. An
// expense records, in `partyKeys`, which member_key each name on it referred to
// AT THE TIME it was written. Later steps calculate from these keys, so
// renames, same-name people and claims with a different email can't mix up
// balances.

const normMember = (s: string): string =>
  String(s || '').replace(/\s*\(Left\)\s*$/i, '').trim().toLowerCase();

// Which member row does `name` (as written on an expense) refer to in `group`?
// Returns undefined unless the answer is unambiguous — never guesses.
export const resolveMemberKey = (group: Group | undefined | null, name: string): string | undefined => {
  const mk = group?.memberKeys;
  if (!mk || !name || name === 'SYSTEM') return undefined;
  if (mk[name]) return mk[name];
  const target = normMember(name);
  if (!target) return undefined;
  // An email written in place of a name → the member whose identity is it.
  if (target.includes('@')) {
    const byEmail = Object.entries(group?.memberIdentities || {})
      .filter(([, id]) => String(id).toLowerCase() === target)
      .map(([disp]) => mk[disp])
      .filter(Boolean);
    const uniq = Array.from(new Set(byEmail));
    return uniq.length === 1 ? uniq[0] : undefined;
  }
  const pick = (cands: [string, string][]): string | undefined => {
    const keys = Array.from(new Set(cands.map(([, k]) => k)));
    if (keys.length === 1) return keys[0];
    // Same name on a live row and a "(Left)" row → the live one.
    const live = Array.from(new Set(cands.filter(([d]) => !/\(Left\)\s*$/i.test(d)).map(([, k]) => k)));
    return live.length === 1 ? live[0] : undefined;
  };
  const exact = Object.entries(mk).filter(([d]) => normMember(d) === target);
  if (exact.length > 0) return pick(exact);
  // Flat first name ("Damini") → the one member it can only mean.
  const byFirst = Object.entries(mk).filter(([d]) => normMember(d).split(' ')[0] === target);
  return byFirst.length > 0 ? pick(byFirst) : undefined;
};

// Every person-name an expense mentions (payer, splitters, share keys,
// pre-conversion share keys).
const namesOnExpense = (e: Expense): string[] => {
  const out = new Set<string>();
  if (e.paid) out.add(e.paid);
  (e.splitters || []).forEach((n) => n && out.add(n));
  Object.keys(e.shares || {}).forEach((n) => out.add(n));
  Object.keys(e.origShares || {}).forEach((n) => out.add(n));
  out.delete('SYSTEM');
  return Array.from(out);
};

// Add a member_key for any name on the expense that doesn't have one yet.
// Existing entries are never changed (a key records who the name meant when
// written). Returns the updated expense, or null when nothing was added.
export const fillPartyKeys = (e: Expense, group: Group | undefined | null): Expense | null => {
  if (!group?.memberKeys) return null;
  const current = e.partyKeys || {};
  let added: Record<string, string> | null = null;
  for (const nm of namesOnExpense(e)) {
    if (current[nm]) continue;
    const k = resolveMemberKey(group, nm);
    if (!k) continue;
    if (!added) added = { ...current };
    added[nm] = k;
  }
  return added ? { ...e, partyKeys: added } : null;
};

// A same-named person added with an email is stored as "Name (emailpart)" so
// expenses (which still carry names) can't mix the two people up. That tag is
// bookkeeping, not part of their name: return the name without it wherever the
// email is shown alongside to tell them apart. Only strips a tag that matches
// the member's own email, so a real name like "Ram (Delhi)" is left alone.
export const withoutEmailTag = (group: Group | undefined | null, name: string): string => {
  if (!name) return name;
  const left = /\s*\(Left\)\s*$/i.test(name);
  const core = name.replace(/\s*\(Left\)\s*$/i, '');
  const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(core);
  if (!m) return name;
  const email = String(getPersonKey(group, name) || '');
  if (!email.includes('@')) return name;
  if (email.split('@')[0].toLowerCase() !== m[2].trim().toLowerCase()) return name;
  return left ? `${m[1]} (Left)` : m[1];
};

// Label for a person in a picker (paid by / split with). Hides the auto email
// tag; when two members would then look identical, adds the email so they can
// still be told apart ("Damini Gupta · ss@gmail.com").
export const pickerLabel = (group: Group | undefined | null, name: string, roster: string[]): string => {
  const shown = withoutEmailTag(group, name);
  const base = (s: string) => withoutEmailTag(group, s).replace(/\s*\(Left\)\s*$/i, '').trim().toLowerCase();
  const b = base(name);
  const dup = (roster || []).some((o) => o !== name && o.replace(/\s*\(Left\)\s*$/i, '') !== name && base(o) === b);
  if (!dup) return shown;
  const id = String(getPersonKey(group, name) || '');
  return id.includes('@') ? `${shown} · ${id}` : shown;
};

// Name to save for someone joining with profile name `name`. If a different
// member already uses it, add a short tag from their email ("Vandana
// Investment (vandana.g)") so the stored name stays unique — expenses still
// record people by name. withoutEmailTag hides the tag on screen.
export const uniqueProfileName = (name: string, email: string, taken: Set<string>): string => {
  if (!taken.has(name.trim().toLowerCase())) return name;
  const local = String(email || '').split('@')[0];
  if (!local) return name;
  const base = `${name} (${local})`;
  let out = base;
  for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${base} ${i}`;
  return out;
};

// Short name for activity text ("X paid"). Hides the auto email tag; when
// another member shares the same name, adds a short email hint instead
// ("Vandana Investment (vandanagupt…)") so the two are still distinguishable.
export const activityName = (group: Group | undefined | null, name: string): string => {
  if (!name) return name;
  const shown = withoutEmailTag(group, name);
  const base = (s: string) => withoutEmailTag(group, s).replace(/\s*\(Left\)\s*$/i, '').trim().toLowerCase();
  const b = base(name);
  const dup = (group?.members || []).some((o) =>
    o.replace(/\s*\(Left\)\s*$/i, '').trim().toLowerCase() !== name.replace(/\s*\(Left\)\s*$/i, '').trim().toLowerCase() && base(o) === b);
  if (!dup) return shown;
  const email = String(getPersonKey(group, name) || '');
  if (!email.includes('@')) return shown;
  const local = email.split('@')[0];
  return `${shown} (${local.length > 11 ? local.slice(0, 11) + '…' : local})`;
};

// The member's CURRENT roster name for a name written on an expense. Uses the
// member_key the expense recorded, so an expense saved before a rename/claim
// still points at the right person (e.g. "Chirag Gupta" → "Vandana Investment
// (chiraggupta1990)"). Falls back to roster matching, then the name itself.
export const currentMemberName = (group: Group | undefined | null, e: Expense | null | undefined, name: string): string => {
  if (!name || !group) return name;
  const roster = (group.members || []).map((m) => m.replace(/\s*\(Left\)\s*$/i, ''));
  const exact = roster.find((m) => m.toLowerCase() === name.trim().toLowerCase());
  if (exact) return exact;
  const pk = Object.entries(e?.partyKeys || {}).find(([n]) => n.trim().toLowerCase() === name.trim().toLowerCase())?.[1];
  if (pk) {
    const disp = Object.entries(group.memberKeys || {})
      .filter(([, k]) => k === pk)
      .map(([d]) => d)
      .sort((a, b) => Number(/\(Left\)\s*$/i.test(a)) - Number(/\(Left\)\s*$/i.test(b)))[0];
    if (disp) return disp.replace(/\s*\(Left\)\s*$/i, '');
  }
  return canonicalRosterName(name, group.members || []);
};

// Picker label split into a name and an optional email line, for UIs that
// show the email smaller underneath instead of inline.
export const pickerParts = (group: Group | undefined | null, name: string, roster: string[]): { label: string; sub?: string } => {
  const full = pickerLabel(group, name, roster);
  const i = full.indexOf(' · ');
  return i < 0 ? { label: full } : { label: full.slice(0, i), sub: full.slice(i + 3) };
};

// Like buildNameEmailResolver, but for ANY recorded identity (email or hidden
// person_id). Lets a Non-Group person with no email ("Chhutki") join their
// in-group self when the name means exactly ONE person across all groups.
// Ambiguous names (two different identities) return undefined — never merged.
export const buildNameIdentityResolver = (
  groups: Array<Group | undefined | null>
): ((name: string) => string | undefined) => {
  const map: Record<string, string> = {};
  const ambiguous = new Set<string>();
  const norm = (s: string) => s.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
  for (const g of groups) {
    if (!g || (g as any).isDirect) continue;
    for (const [nm, raw] of Object.entries(g.memberIdentities || {})) {
      const key = norm(nm);
      const id = String(raw);
      if (!key || !id) continue;
      if (map[key] && map[key] !== id) ambiguous.add(key);
      else map[key] = id;
    }
  }
  return (name: string) => {
    const key = norm(name);
    return ambiguous.has(key) ? undefined : map[key];
  };
};

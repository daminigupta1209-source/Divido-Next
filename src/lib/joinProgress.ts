import { Group, Expense } from './types';
import { getPersonKey, withoutEmailTag } from './identity';

// "Yet to join" growth nudges on the home screen: which members of each group
// haven't opened the invite link yet, and an app-wide joined-vs-pending tally
// for the gamified banner.

// Only groups touched in this window count toward the banner, so an old trip or
// a large Splitwise import (everyone arrives as pending) doesn't inflate it.
export const ACTIVE_GROUP_DAYS = 60;

const LEFT_RE = /\s*\(Left\)\s*$/i;
const ME_RE = /\s*\(me\)\s*$/i;

// Display name for a roster entry: no "(me)" / "(Left)" suffix, no email tag.
export const cleanMemberName = (g: Group, name: string): string =>
  withoutEmailTag(g, name).replace(ME_RE, '').replace(LEFT_RE, '').trim();

const isMe = (g: Group, name: string, myName: string): boolean =>
  ME_RE.test(name) || cleanMemberName(g, name).toLowerCase() === cleanMemberName(g, myName).toLowerCase();

// Roster entries that are really in the group: not left, not removed by an admin.
const activeRoster = (g: Group): string[] => {
  const removed = new Set((g.removedMembers || []).map((n) => n.toLowerCase()));
  return g.members.filter((m) => !LEFT_RE.test(m) && !removed.has(m.toLowerCase()));
};

// One member seat in a group: the roster string minus "(Left)", lower-cased.
// Not the clean name: two different people can share a visible name ("Esha
// Gupta" and "Esha Gupta (esha1997)", told apart by email), and each is a seat.
const seatOf = (m: string): string => m.replace(LEFT_RE, '').trim().toLowerCase();

// Raw pendingMembers entries of `g` that are real pending seats: on the active
// roster, not me, one per seat.
const pendingRawFor = (g: Group, myName: string): string[] => {
  if (g.isDirect) return [];
  const roster = new Set(activeRoster(g).map((m) => m.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of g.pendingMembers || []) {
    if (!roster.has(m.toLowerCase()) || isMe(g, m, myName)) continue;
    if (!cleanMemberName(g, m) || seen.has(seatOf(m))) continue;
    seen.add(seatOf(m));
    out.push(m);
  }
  return out;
};

// Members of `g` who were added but haven't joined, excluding me. Stale entries
// in pendingMembers that are no longer on the active roster are ignored. One
// name per seat, so two same-named people both appear.
export const pendingNamesFor = (g: Group, myName: string): string[] =>
  pendingRawFor(g, myName).map((m) => cleanMemberName(g, m));

// A group's latest-activity timestamp: its latest non-deleted expense date, else
// its creation date. Returns null when neither is available (a brand new group
// with no dates at all), which callers treat as "active"/"recent" by default.
export const groupActivityTimestamp = (g: Group, expenses: Expense[]): number | null => {
  const gid = String(g.id);
  let latest = '';
  for (const e of expenses) {
    if (String(e.gId) === gid && !e.isDeleted && e.date > latest) latest = e.date;
  }
  const ref = latest || g.createdDate || '';
  if (!ref) return null;
  const t = new Date(ref).getTime();
  return isNaN(t) ? null : t;
};

// A group is active if its latest expense, or its creation date when it has no
// expenses, falls inside the window. A group with no dates at all is brand new.
export const isActiveGroup = (g: Group, expenses: Expense[], now: number, days = ACTIVE_GROUP_DAYS): boolean => {
  const t = groupActivityTimestamp(g, expenses);
  if (t === null) return true;
  return now - t <= days * 86400000;
};

// Case/suffix-insensitive lookup of a pendingMembers roster name against a
// group's permanent member_key map. group.memberKeys is keyed by title-cased
// display names (useSupabaseSync), which may differ in case or a "(Left)"
// suffix from the name as recorded in pendingMembers. Mirrors getPersonKey's
// matching rule, but returns undefined instead of falling back to the name.
const memberKeyFor = (g: Group, name: string): string | undefined => {
  const mk = g.memberKeys;
  if (!mk) return undefined;
  if (mk[name]) return mk[name];
  if (mk[name + ' (Left)']) return mk[name + ' (Left)'];
  const target = name.replace(LEFT_RE, '').trim().toLowerCase();
  for (const k of Object.keys(mk)) {
    if (k.replace(LEFT_RE, '').trim().toLowerCase() === target) return mk[k];
  }
  return undefined;
};

// One group a person is pending in: the roster name exactly as stored in that
// group's pendingMembers, and their permanent member_key there (when known).
export interface PendingSpot {
  group: Group;
  memberName: string;
  memberKey: string | undefined;
}

export interface PendingPerson { key: string; name: string; groupName: string; spots: PendingSpot[] }

export interface JoinProgress {
  pending: PendingPerson[]; // distinct people yet to join, across active groups
  joinedKeys: string[]; // distinct people (other than me) who have joined
  total: number;
  perGroup: { group: Group; names: string[] }[]; // active groups with pending people
  // Per-spot tally (one spot = one member seat in one active group, me
  // excluded) — what the banner counts, so every single join lowers it even
  // when the same friend is still pending in another group.
  pendingSpotCount: number;
  totalSpots: number;
  spotIndex: {
    pending: Record<string, { name: string; groupName: string }>;
    joined: Record<string, string>; // spot key → current display name
  };
}

// Stable key for one member seat. The permanent member_key survives the rename
// a claim does (placeholder "Rahul" → Google name "Rahul Sharma"); the name key
// is the fallback for groups without member keys.
const spotKeysFor = (g: Group, name: string): string[] => {
  const keys: string[] = [];
  const mk = memberKeyFor(g, name);
  if (mk) keys.push(`${g.id}|k:${mk}`);
  keys.push(`${g.id}|n:${seatOf(name)}`);
  return keys;
};

// Cross-group tally. A person is keyed by their identity (email / person_id,
// else lower-cased name), so someone pending in three groups counts once. They
// stay "pending" while they're pending in ANY active group.
export const computeJoinProgress = (
  groups: Group[],
  expenses: Expense[],
  myNameFor: (gId: string | number) => string,
  now: number = Date.now(),
): JoinProgress => {
  const pendingAcc = new Map<string, { key: string; groupName: string; spots: PendingSpot[] }>();
  const seenAll = new Set<string>();
  const perGroup: JoinProgress['perGroup'] = [];
  const spotIndex: JoinProgress['spotIndex'] = { pending: {}, joined: {} };
  let pendingSpotCount = 0;
  let totalSpots = 0;

  for (const g of groups) {
    if (!g || g.isDirect || String(g.id) === 'STANDALONE') continue;
    if (!isActiveGroup(g, expenses, now)) continue;
    const myName = myNameFor(g.id);
    const keyOf = (m: string) => String(getPersonKey(g, m.replace(ME_RE, ''))).trim().toLowerCase();
    const pendingRaw = pendingRawFor(g, myName);
    const names = pendingRaw.map((m) => cleanMemberName(g, m));
    const pendingSet = new Set(pendingRaw.map(seatOf));

    const seenSeats = new Set<string>();
    for (const m of activeRoster(g)) {
      if (isMe(g, m, myName)) continue;
      seenAll.add(keyOf(m));
      const clean = cleanMemberName(g, m);
      if (!clean || seenSeats.has(seatOf(m))) continue;
      seenSeats.add(seatOf(m));
      totalSpots++;
      const keys = spotKeysFor(g, m);
      if (pendingSet.has(seatOf(m))) {
        pendingSpotCount++;
        spotIndex.pending[keys[0]] = { name: clean, groupName: g.name || 'your group' };
      } else {
        for (const k of keys) spotIndex.joined[k] = clean;
      }
    }
    if (names.length === 0) continue;
    perGroup.push({ group: g, names });
    for (const m of pendingRaw) {
      const key = keyOf(m);
      if (!pendingAcc.has(key)) pendingAcc.set(key, { key, groupName: g.name || 'your group', spots: [] });
      pendingAcc.get(key)!.spots.push({ group: g, memberName: m, memberKey: memberKeyFor(g, m) });
    }
  }

  // Display name: the longest/most complete clean name seen across the
  // person's groups ("Rahul Kumar" over "Rahul"). key/groupName stay exactly
  // as first seen, since the celebration snapshot depends on them.
  const pending: PendingPerson[] = Array.from(pendingAcc.values()).map((p) => {
    let name = '';
    for (const s of p.spots) {
      const clean = cleanMemberName(s.group, s.memberName);
      if (clean.length > name.length) name = clean;
    }
    return { key: p.key, name, groupName: p.groupName, spots: p.spots };
  });

  // Sort by how many groups they're pending in (desc), then by how recently
  // their most recent group was active (desc), then by name (asc). A group
  // with no date info at all (groupActivityTimestamp === null) counts as "now".
  const latestActivityFor = (p: PendingPerson) =>
    Math.max(...p.spots.map((s) => groupActivityTimestamp(s.group, expenses) ?? now));
  pending.sort((a, b) => {
    if (b.spots.length !== a.spots.length) return b.spots.length - a.spots.length;
    const activityDiff = latestActivityFor(b) - latestActivityFor(a);
    if (activityDiff !== 0) return activityDiff;
    return a.name.localeCompare(b.name);
  });

  const joinedKeys = Array.from(seenAll).filter((k) => !pendingAcc.has(k));
  return { pending, joinedKeys, total: seenAll.size, perGroup, pendingSpotCount, totalSpots, spotIndex };
};

// "Rahul", "Rahul & Priya", "Rahul, Priya & Amit", "Rahul, Priya & 3 others".
export const joinNames = (names: string[]): string => {
  if (names.length <= 1) return names[0] || '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} & ${names.length - 2} others`;
};

// ---- Celebration snapshot -------------------------------------------------
// The last-seen pending set lives in localStorage, so a later visit can notice
// "Priya was pending, now she's joined" and celebrate it.

// `spots` is the per-seat snapshot the celebration now uses; `pending` (per
// person) is kept so snapshots saved by the previous version still work once.
export interface JoinSnapshot {
  pending: Record<string, { name: string; groupName: string }>;
  spots?: Record<string, { name: string; groupName: string }>;
}

export type JoinCelebration =
  | { kind: 'joined'; people: { name: string; groupName: string }[] }
  | { kind: 'allDone' };

// Compare the previous snapshot with current progress. A seat counts as joined
// only if it's now on the JOINED side: a cancelled invite disappears from both
// sides and isn't celebrated. Names shown are the current ones (after a claim
// the placeholder is usually renamed to the friend's own name).
export const detectCelebration = (prev: JoinSnapshot | null, progress: JoinProgress): JoinCelebration | null => {
  if (!prev) return null;
  let people: { name: string; groupName: string }[];
  if (prev.spots) {
    people = Object.entries(prev.spots)
      .filter(([k]) => k in progress.spotIndex.joined)
      .map(([k, v]) => ({ name: progress.spotIndex.joined[k] || v.name, groupName: v.groupName }));
  } else {
    const joined = new Set(progress.joinedKeys);
    people = Object.entries(prev.pending).filter(([k]) => joined.has(k)).map(([, v]) => v);
  }
  if (people.length === 0) return null;
  if (progress.pendingSpotCount === 0) return { kind: 'allDone' };
  return { kind: 'joined', people };
};

export const toSnapshot = (progress: JoinProgress): JoinSnapshot => ({
  pending: Object.fromEntries(progress.pending.map((p) => [p.key, { name: p.name, groupName: p.groupName }])),
  spots: progress.spotIndex.pending,
});

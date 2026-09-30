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

// Members of `g` who were added but haven't joined, excluding me. Stale entries
// in pendingMembers that are no longer on the active roster are ignored.
export const pendingNamesFor = (g: Group, myName: string): string[] => {
  if (g.isDirect) return [];
  const roster = new Set(activeRoster(g).map((m) => m.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of g.pendingMembers || []) {
    if (!roster.has(m.toLowerCase()) || isMe(g, m, myName)) continue;
    const clean = cleanMemberName(g, m);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
  }
  return out;
};

// A group is active if its latest expense, or its creation date when it has no
// expenses, falls inside the window. A group with no dates at all is brand new.
export const isActiveGroup = (g: Group, expenses: Expense[], now: number, days = ACTIVE_GROUP_DAYS): boolean => {
  const gid = String(g.id);
  let latest = '';
  for (const e of expenses) {
    if (String(e.gId) === gid && !e.isDeleted && e.date > latest) latest = e.date;
  }
  const ref = latest || g.createdDate || '';
  if (!ref) return true;
  const t = new Date(ref).getTime();
  if (isNaN(t)) return true;
  return now - t <= days * 86400000;
};

export interface PendingPerson { key: string; name: string; groupName: string }

export interface JoinProgress {
  pending: PendingPerson[]; // distinct people yet to join, across active groups
  joinedKeys: string[]; // distinct people (other than me) who have joined
  total: number;
  perGroup: { group: Group; names: string[] }[]; // active groups with pending people
}

// Cross-group tally. A person is keyed by their identity (email / person_id,
// else lower-cased name), so someone pending in three groups counts once. They
// stay "pending" while they're pending in ANY active group.
export const computeJoinProgress = (
  groups: Group[],
  expenses: Expense[],
  myNameFor: (gId: string | number) => string,
  now: number = Date.now(),
): JoinProgress => {
  const pending = new Map<string, PendingPerson>();
  const seenAll = new Set<string>();
  const perGroup: JoinProgress['perGroup'] = [];

  for (const g of groups) {
    if (!g || g.isDirect || String(g.id) === 'STANDALONE') continue;
    if (!isActiveGroup(g, expenses, now)) continue;
    const myName = myNameFor(g.id);
    const keyOf = (m: string) => String(getPersonKey(g, m.replace(ME_RE, ''))).trim().toLowerCase();

    for (const m of activeRoster(g)) {
      if (isMe(g, m, myName)) continue;
      seenAll.add(keyOf(m));
    }
    const names = pendingNamesFor(g, myName);
    if (names.length === 0) continue;
    perGroup.push({ group: g, names });
    const pendingRaw = (g.pendingMembers || []).filter((m) => names.some((n) => n.toLowerCase() === cleanMemberName(g, m).toLowerCase()));
    for (const m of pendingRaw) {
      const key = keyOf(m);
      if (!pending.has(key)) pending.set(key, { key, name: cleanMemberName(g, m), groupName: g.name || 'your group' });
    }
  }

  const joinedKeys = Array.from(seenAll).filter((k) => !pending.has(k));
  return { pending: Array.from(pending.values()), joinedKeys, total: seenAll.size, perGroup };
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

export interface JoinSnapshot { pending: Record<string, { name: string; groupName: string }> }

export type JoinCelebration =
  | { kind: 'joined'; people: { name: string; groupName: string }[] }
  | { kind: 'allDone' };

// Compare the previous snapshot with current progress. Only people who are now
// on the JOINED list count: a cancelled invite disappears from both lists and
// isn't celebrated.
export const detectCelebration = (prev: JoinSnapshot | null, progress: JoinProgress): JoinCelebration | null => {
  if (!prev) return null;
  const joined = new Set(progress.joinedKeys);
  const people = Object.entries(prev.pending)
    .filter(([k]) => joined.has(k))
    .map(([, v]) => v);
  if (people.length === 0) return null;
  if (progress.pending.length === 0) return { kind: 'allDone' };
  return { kind: 'joined', people };
};

export const toSnapshot = (progress: JoinProgress): JoinSnapshot => ({
  pending: Object.fromEntries(progress.pending.map((p) => [p.key, { name: p.name, groupName: p.groupName }])),
});

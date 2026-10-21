import type { Expense, Group } from './types';

// Shared by the Home "Non-Group" card and the Non-Group screen so both read
// balances from the SAME canonical engine. Home used to hand-roll this with an
// exact `paid === me` match, which missed whenever I'm stored under my full
// name / email in a shared thread — the card then said "Settled up" while the
// screen showed a real balance.

// myName: MY member name in this thread (matched by name or email). In a shared
// thread it's the sharer's label for me, which can differ from my own name.
export type DirectThread = { groupId: string; otherName: string; email: string; pending: boolean; myName?: string };

export type NonGroupPerson = {
  name: string;
  // Every (cleaned) name this person appears under — more than one when the
  // same email was saved with different names ("Damini Gupta" / "Damini Guptaaa").
  aliases: string[];
  email: string;
  pending: boolean;
  directGroupId?: string;
  // The PERSON's net position per currency: negative = they owe me.
  bal: Record<string, number>;
  count: number;
};

type GetMemberBalance = (groupId: string | number, memberName: string) => Record<string, number>;

export const cleanName = (n: string) => (n || '').replace(/\s*\(Left\)$/i, '').trim();

export const makeIsMe = (me: string, userName?: string) => {
  const meLower = cleanName(me).toLowerCase();
  const fullLower = userName ? cleanName(userName).toLowerCase() : '';
  return (name: string) => {
    const c = cleanName(name).toLowerCase();
    if (!c) return false;
    if (c === 'you' || c === meLower) return true;
    if (fullLower && c === fullLower) return true;
    // First-name guess only when my full name is unknown: with it known, a
    // friend who shares my first name ("Damini Gupta" for "Damini …") is
    // someone else and must not be hidden as me.
    if (!fullLower && (c.startsWith(meLower + ' ') || c.endsWith(' ' + meLower))) return true;
    return false;
  };
};

// Hidden 2-person "direct" groups = shared non-group threads.
export const buildDirectThreads = (groups: Group[], me: string, userName?: string, userEmail?: string): DirectThread[] => {
  const myFirst = (me || '').trim().toLowerCase();
  const myFull = (userName || '').trim().toLowerCase();
  const myEmailLower = (userEmail || '').trim().toLowerCase();
  return groups
    .filter((g) => g.isDirect)
    .map((g) => {
      // "Me" in this thread can be stored under my first name, my full name,
      // or (after another device/claim synced it) keyed only by my email — so
      // exclude by all three, else we'd pick MYSELF as the other person.
      const isMe = (m: string) => {
        const c = cleanName(m).toLowerCase();
        if (c && (c === myFirst || c === myFull)) return true;
        const id = (g.memberIdentities?.[m] || '').trim().toLowerCase();
        return !!myEmailLower && id === myEmailLower;
      };
      const otherRaw = (g.members || []).find((m) => cleanName(m) && !isMe(m)) || '';
      const other = cleanName(otherRaw);
      const myRaw = (g.members || []).find((m) => cleanName(m) && isMe(m)) || '';
      return {
        groupId: String(g.id),
        otherName: other,
        email: (g.memberIdentities?.[otherRaw] || '').includes('@') ? g.memberIdentities![otherRaw] : '',
        pending: (g.pendingMembers || []).some((pm) => cleanName(pm).toLowerCase() === other.toLowerCase()),
        myName: cleanName(myRaw),
      };
    })
    .filter((t) => t.otherName);
};

const expenseInvolves = (e: Expense, lowerName: string) => {
  if (cleanName(e.paid).toLowerCase() === lowerName) return true;
  return (e.splitters || []).some((s) => cleanName(s).toLowerCase() === lowerName);
};

// One entry per OTHER person. Balance is combined across both buckets (their
// plain STANDALONE net + their net in a shared direct thread) via the canonical
// engine — never hand-rolled.
//
// A person is identified by email when one is known, else by name — so the
// same email saved under different names collapses into ONE entry whose
// balance sums every alias. Shown name: the shared-thread name if any (that's
// the linked account), else the name on the newest expense, else the most-used.
export const computeNonGroupPeople = (
  expenses: Expense[],
  directThreads: DirectThread[],
  isMe: (name: string) => boolean,
  getMemberBalance: GetMemberBalance,
): NonGroupPerson[] => {
  const directGroupIds = new Set(directThreads.map((t) => String(t.groupId)));
  const nonGroupExps = expenses.filter((e) => e && !e.isDeleted && (String(e.gId) === 'STANDALONE' || directGroupIds.has(String(e.gId))));
  const standaloneExps = expenses.filter((e) => e && String(e.gId) === 'STANDALONE' && !e.isDeleted);

  // Per distinct name (lowercased): how it was seen.
  type N = { name: string; email: string; standalone: boolean; lastTs: number; uses: number; threads: DirectThread[]; pending: boolean };
  const byName = new Map<string, N>();
  const getN = (c: string): N => {
    const key = c.toLowerCase();
    let n = byName.get(key);
    if (!n) { n = { name: c, email: '', standalone: false, lastTs: -1, uses: 0, threads: [], pending: false }; byName.set(key, n); }
    return n;
  };
  // Seed shared (direct) threads first so pending/email are captured.
  directThreads.forEach((t) => {
    const c = cleanName(t.otherName);
    if (!c || isMe(c)) return;
    const n = getN(c);
    n.threads.push(t);
    n.pending = n.pending || t.pending;
    if (!n.email && t.email) n.email = t.email.trim().toLowerCase();
  });
  // Add plain STANDALONE participants.
  standaloneExps.forEach((e) => {
    const others = new Set<string>();
    if (e.paid) others.add(cleanName(e.paid));
    (e.splitters || []).forEach((s) => others.add(cleanName(s)));
    const otherNames = Array.from(others).filter((c) => c && !isMe(c));
    // otherEmail only identifies the counterpart on a true 2-person split.
    const otherEmail = (e.otherEmail || '').trim().toLowerCase();
    const emailForThis = otherNames.length === 1 && otherEmail.includes('@') ? otherEmail : '';
    const ts = e.timestamp || 0;
    otherNames.forEach((c) => {
      const n = getN(c);
      n.standalone = true;
      n.uses += 1;
      if (ts > n.lastTs) n.lastTs = ts;
      if (!n.email && emailForThis) n.email = emailForThis;
    });
  });

  // Group names into people: by email when known, else by the name itself.
  // Each name lands in exactly one person, so no balance is counted twice.
  const people = new Map<string, N[]>();
  byName.forEach((n, key) => {
    const pKey = n.email ? `email:${n.email}` : `name:${key}`;
    const list = people.get(pKey);
    if (list) list.push(n); else people.set(pKey, [n]);
  });

  return Array.from(people.values())
    .map((names) => {
      const threaded = names.find((n) => n.threads.length > 0);
      const shownN = threaded || names.slice().sort((a, b) => b.lastTs - a.lastTs || b.uses - a.uses || a.name.localeCompare(b.name))[0];
      const aliasKeys = new Set(names.map((n) => n.name.toLowerCase()));
      const bal: Record<string, number> = {};
      const add = (b: Record<string, number>) => Object.entries(b).forEach(([c, v]) => { bal[c] = (bal[c] || 0) + v; });
      names.forEach((n) => {
        if (n.standalone) add(getMemberBalance('STANDALONE', n.name));
        n.threads.forEach((t) => add(getMemberBalance(t.groupId, t.otherName)));
      });
      const count = nonGroupExps.filter((e) => Array.from(aliasKeys).some((k) => expenseInvolves(e, k))).length;
      return {
        name: shownN.name,
        aliases: names.map((n) => n.name),
        email: names.find((n) => n.email)?.email || '',
        pending: names.some((n) => n.pending),
        directGroupId: threaded ? String(threaded.threads[0].groupId) : undefined,
        bal,
        count,
      };
    })
    // Hide empty leftovers: a person with no expenses AND no balance (e.g. a
    // stray/abandoned direct thread) shouldn't clutter the list.
    .filter((p) => p.count > 0 || Object.values(p.bal).some((v) => Math.abs(v) > 0.01))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// ── Permanent Non-Group friend IDs ──────────────────────────────────────────
// Like a group member's member_key: every Non-Group friend gets an id the
// moment they're added, saved on each expense as `otherKey`. Email stays
// optional, exactly as in groups.
export const genNonGroupFriendKey = (): string =>
  'ngp-' + ((typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const isNonGroupFriendKey = (v?: string): boolean => !!v && v.startsWith('ngp-');

export type NonGroupFriend = { name: string; email: string; key: string };

// The friends I already have in plain Non-Group, one per id (newest name/email
// wins). Only expenses that carry an id count.
export const nonGroupFriendsFromExpenses = (expenses: Expense[], isMe: (n: string) => boolean): NonGroupFriend[] => {
  const byKey = new Map<string, NonGroupFriend & { ts: number }>();
  expenses.forEach((e) => {
    if (!e || e.isDeleted || String(e.gId) !== 'STANDALONE' || !isNonGroupFriendKey(e.otherKey)) return;
    const other = [e.paid, ...(e.splitters || [])].map((n) => cleanName(n || '')).find((n) => n && !isMe(n));
    if (!other) return;
    const ts = e.timestamp || 0;
    const cur = byKey.get(e.otherKey!);
    if (!cur || ts >= cur.ts) {
      byKey.set(e.otherKey!, { name: other, email: (e.otherEmail || cur?.email || '').toLowerCase(), key: e.otherKey!, ts });
    }
  });
  return Array.from(byKey.values()).map(({ ts: _ts, ...f }) => f);
};

// Which id a picked friend gets: their own id if the pick carried one; else the
// id already used with that email; else the ONE id used with that exact name
// (several → ambiguous, new id); else a brand-new id.
export const resolveNonGroupFriendKey = (
  expenses: Expense[],
  picked: { name: string; email?: string; identity?: string },
  isMe: (n: string) => boolean,
): string => {
  if (isNonGroupFriendKey(picked.identity)) return picked.identity!;
  const friends = nonGroupFriendsFromExpenses(expenses, isMe);
  const em = (picked.email || '').trim().toLowerCase();
  if (em.includes('@')) {
    const byEmail = friends.find((f) => f.email === em);
    if (byEmail) return byEmail.key;
    return genNonGroupFriendKey();
  }
  const nm = cleanName(picked.name).toLowerCase();
  const byName = friends.filter((f) => f.name.toLowerCase() === nm && !f.email);
  return byName.length === 1 ? byName[0].key : genNonGroupFriendKey();
};

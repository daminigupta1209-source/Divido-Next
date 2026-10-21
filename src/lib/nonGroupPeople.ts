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
  // Friend ids (plain Non-Group) behind this person; empty for older entries.
  keys?: string[];
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
  const standaloneExps = expenses.filter((e) => e && String(e.gId) === 'STANDALONE' && !e.isDeleted);
  const threadExps = expenses.filter((e) => e && !e.isDeleted && directGroupIds.has(String(e.gId)));

  // One entry per friend id (plain Non-Group expenses that carry otherKey) and
  // one per distinct name (older expenses without an id, and shared threads).
  type N = { name: string; email: string; key?: string; standalone: boolean; lastTs: number; uses: number; threads: DirectThread[]; pending: boolean; count: number };
  const entries = new Map<string, N>();
  const get = (id: string, name: string, key?: string): N => {
    let n = entries.get(id);
    if (!n) { n = { name, email: '', key, standalone: false, lastTs: -1, uses: 0, threads: [], pending: false, count: 0 }; entries.set(id, n); }
    return n;
  };
  // Seed shared (direct) threads first so pending/email are captured.
  directThreads.forEach((t) => {
    const c = cleanName(t.otherName);
    if (!c || isMe(c)) return;
    const n = get(`name:${c.toLowerCase()}`, c);
    n.threads.push(t);
    n.pending = n.pending || t.pending;
    if (!n.email && t.email) n.email = t.email.trim().toLowerCase();
    n.count += threadExps.filter((e) => String(e.gId) === String(t.groupId) && expenseInvolves(e, cleanName(t.otherName).toLowerCase())).length;
  });
  // Plain Non-Group participants: by friend id when the expense has one.
  standaloneExps.forEach((e) => {
    const others = new Set<string>();
    if (e.paid) others.add(cleanName(e.paid));
    (e.splitters || []).forEach((sp) => others.add(cleanName(sp)));
    const otherNames = Array.from(others).filter((c) => c && !isMe(c));
    // otherEmail / otherKey only identify the counterpart on a true 2-person split.
    const otherEmail = (e.otherEmail || '').trim().toLowerCase();
    const emailForThis = otherNames.length === 1 && otherEmail.includes('@') ? otherEmail : '';
    const keyForThis = otherNames.length === 1 && isNonGroupFriendKey(e.otherKey) ? e.otherKey! : '';
    const ts = e.timestamp || 0;
    otherNames.forEach((c) => {
      const n = keyForThis ? get(`key:${keyForThis}`, c, keyForThis) : get(`name:${c.toLowerCase()}`, c);
      n.standalone = true;
      n.uses += 1;
      n.count += 1;
      if (ts >= n.lastTs) { n.lastTs = ts; if (keyForThis) n.name = c; }
      if (emailForThis && (!n.email || keyForThis)) n.email = emailForThis;
    });
  });

  // Group entries into people. Same email → one person. A name-only entry joins
  // the ONE friend id with that name (no clash of emails); else it stands alone.
  const keyed = Array.from(entries.values()).filter((n) => n.key);
  const people = new Map<string, N[]>();
  const push = (pk: string, n: N) => { const l = people.get(pk); if (l) l.push(n); else people.set(pk, [n]); };
  keyed.forEach((n) => push(n.email ? `email:${n.email}` : `key:${n.key}`, n));
  entries.forEach((n) => {
    if (n.key) return;
    if (n.email) { push(`email:${n.email}`, n); return; }
    const same = keyed.filter((k) => k.name.toLowerCase() === n.name.toLowerCase());
    if (same.length === 1) push(same[0].email ? `email:${same[0].email}` : `key:${same[0].key}`, n);
    else push(`name:${n.name.toLowerCase()}`, n);
  });

  return Array.from(people.values())
    .map((list) => {
      const threaded = list.find((n) => n.threads.length > 0);
      const shownN = threaded || list.slice().sort((a, b) => b.lastTs - a.lastTs || b.uses - a.uses || a.name.localeCompare(b.name))[0];
      const bal: Record<string, number> = {};
      const add = (b: Record<string, number>) => Object.entries(b).forEach(([c, v]) => { bal[c] = (bal[c] || 0) + v; });
      list.forEach((n) => {
        // Plain Non-Group balances are read from the friend-id ledger: an id
        // entry by its id, an older name-only entry by its name (only the
        // expenses without an id are under names there, so nothing doubles).
        if (n.standalone) add(getMemberBalance(STANDALONE_BY_KEY, n.key || n.name));
        n.threads.forEach((t) => add(getMemberBalance(t.groupId, t.otherName)));
      });
      return {
        name: shownN.name,
        aliases: Array.from(new Set(list.map((n) => n.name))),
        email: list.find((n) => n.email)?.email || '',
        pending: list.some((n) => n.pending),
        directGroupId: threaded ? String(threaded.threads[0].groupId) : undefined,
        keys: list.map((n) => n.key).filter((k): k is string => !!k),
        bal,
        count: list.reduce((sum, n) => sum + n.count, 0),
      };
    })
    // Hide empty leftovers: a person with no expenses AND no balance (e.g. a
    // stray/abandoned direct thread) shouldn't clutter the list.
    .filter((p) => p.count > 0 || Object.values(p.bal).some((v) => Math.abs(v) > 0.01))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// Balance bucket for plain Non-Group, computed with each friend's id in place of
// their name (see standaloneInKeySpace). The plain 'STANDALONE' bucket stays
// name-based for screens that still read by name.
export const STANDALONE_BY_KEY = 'STANDALONE_BY_KEY';

// Plain Non-Group expenses with the friend's name swapped for their id, so the
// balance engine keeps two same-named friends apart. Expenses without an id are
// unchanged (still by name).
export const standaloneInKeySpace = (exps: Expense[], isMe: (n: string) => boolean): Expense[] =>
  exps.map((e) => {
    if (!isNonGroupFriendKey(e.otherKey)) return e;
    const names = Array.from(new Set([e.paid, ...(e.splitters || [])].map((n) => cleanName(n || '')))).filter((n) => n && !isMe(n));
    if (names.length !== 1) return e;
    const other = names[0].toLowerCase();
    const k = e.otherKey!;
    const swap = (n: string) => (cleanName(n || '').toLowerCase() === other ? k : n);
    const shares = e.shares
      ? Object.fromEntries(Object.entries(e.shares).map(([n, v]) => [swap(n), v]))
      : e.shares;
    return { ...e, paid: swap(e.paid), splitters: (e.splitters || []).map(swap), shares };
  });

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

// ── Step 5: give older plain Non-Group expenses a friend id ─────────────────
// Runs on the phone (STANDALONE expenses are local). Only 2-person expenses
// without an id are touched, and only when it's clear who the friend is:
//   * with an email → the id already used with that email, else one new id per
//     email (same email = same friend);
//   * no email → the ONE id already used with that name; if no id has that name
//     yet, one new id shared by all of that name's older expenses (they were
//     already one card); if two or more ids share the name → left alone.
// Also fills myEmail. Idempotent: returns the same array when nothing changes.
export const backfillNonGroupKeys = (
  expenses: Expense[],
  isMe: (n: string) => boolean,
  myEmail?: string,
): Expense[] => {
  const me = (myEmail || '').trim().toLowerCase();
  const friends = nonGroupFriendsFromExpenses(expenses, isMe);
  const keyByEmail = new Map<string, string>();
  friends.forEach((f) => { if (f.email && !keyByEmail.has(f.email)) keyByEmail.set(f.email, f.key); });
  const keysByName = new Map<string, Set<string>>();
  friends.forEach((f) => {
    const n = f.name.toLowerCase();
    if (!keysByName.has(n)) keysByName.set(n, new Set());
    keysByName.get(n)!.add(f.key);
  });
  const newKeyForName = new Map<string, string>();
  let changed = false;
  const out = expenses.map((e) => {
    if (!e || e.isDeleted || String(e.gId) !== 'STANDALONE') return e;
    let next = e;
    if (!e.myEmail && me.includes('@')) next = { ...next, myEmail: me };
    if (!isNonGroupFriendKey(e.otherKey)) {
      const others = Array.from(new Set([e.paid, ...(e.splitters || [])].map((n) => cleanName(n || '')))).filter((n) => n && !isMe(n));
      if (others.length === 1) {
        const nm = others[0].toLowerCase();
        const em = (e.otherEmail || '').trim().toLowerCase();
        let key = '';
        if (em.includes('@') && em !== me) {
          key = keyByEmail.get(em) || '';
          if (!key) { key = genNonGroupFriendKey(); keyByEmail.set(em, key); }
        } else if (!em) {
          const named = keysByName.get(nm);
          if (named && named.size === 1) key = Array.from(named)[0];
          else if (!named || named.size === 0) {
            key = newKeyForName.get(nm) || genNonGroupFriendKey();
            newKeyForName.set(nm, key);
          }
        }
        if (key) next = { ...next, otherKey: key };
      }
    }
    if (next !== e) changed = true;
    return next;
  });
  return changed ? out : expenses;
};

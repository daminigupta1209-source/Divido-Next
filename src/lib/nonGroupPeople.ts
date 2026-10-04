import type { Expense, Group } from './types';

// Shared by the Home "Non-Group" card and the Non-Group screen so both read
// balances from the SAME canonical engine. Home used to hand-roll this with an
// exact `paid === me` match, which missed whenever I'm stored under my full
// name / email in a shared thread — the card then said "Settled up" while the
// screen showed a real balance.

export type DirectThread = { groupId: string; otherName: string; email: string; pending: boolean };

export type NonGroupPerson = {
  name: string;
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
    if (c.startsWith(meLower + ' ') || c.endsWith(' ' + meLower)) return true;
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
      return {
        groupId: String(g.id),
        otherName: other,
        email: (g.memberIdentities?.[otherRaw] || '').includes('@') ? g.memberIdentities![otherRaw] : '',
        pending: (g.pendingMembers || []).some((pm) => cleanName(pm).toLowerCase() === other.toLowerCase()),
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
export const computeNonGroupPeople = (
  expenses: Expense[],
  directThreads: DirectThread[],
  isMe: (name: string) => boolean,
  getMemberBalance: GetMemberBalance,
): NonGroupPerson[] => {
  const directGroupIds = new Set(directThreads.map((t) => String(t.groupId)));
  const nonGroupExps = expenses.filter((e) => e && !e.isDeleted && (String(e.gId) === 'STANDALONE' || directGroupIds.has(String(e.gId))));

  type P = { name: string; email: string; standalone: boolean; directGroupId?: string; otherNameInGroup?: string; pending: boolean };
  const byName = new Map<string, P>();
  // Seed shared (direct) threads first so pending/email are captured.
  directThreads.forEach((t) => {
    const c = cleanName(t.otherName);
    if (!c || isMe(c)) return;
    const key = c.toLowerCase();
    const ex = byName.get(key);
    if (ex) {
      ex.directGroupId = String(t.groupId);
      ex.otherNameInGroup = t.otherName;
      ex.pending = ex.pending || t.pending;
      if (!ex.email && t.email) ex.email = t.email;
    } else {
      byName.set(key, { name: c, email: t.email || '', standalone: false, directGroupId: String(t.groupId), otherNameInGroup: t.otherName, pending: t.pending });
    }
  });
  // Add plain STANDALONE participants.
  expenses
    .filter((e) => e && String(e.gId) === 'STANDALONE' && !e.isDeleted)
    .forEach((e) => {
      const names = new Set<string>();
      if (e.paid) names.add(e.paid);
      (e.splitters || []).forEach((s) => names.add(s));
      const otherEmail = (e.otherEmail || '').trim().toLowerCase();
      names.forEach((raw) => {
        const c = cleanName(raw);
        if (!c || isMe(c)) return;
        const key = c.toLowerCase();
        const ex = byName.get(key);
        if (ex) { ex.standalone = true; if (!ex.email && otherEmail.includes('@')) ex.email = otherEmail; }
        else byName.set(key, { name: c, email: otherEmail.includes('@') ? otherEmail : '', standalone: true, pending: false });
      });
    });
  return Array.from(byName.values())
    .map((p) => {
      const key = p.name.toLowerCase();
      const bal: Record<string, number> = {};
      if (p.standalone) Object.entries(getMemberBalance('STANDALONE', p.name)).forEach(([c, v]) => { bal[c] = (bal[c] || 0) + v; });
      if (p.directGroupId && p.otherNameInGroup) Object.entries(getMemberBalance(p.directGroupId, p.otherNameInGroup)).forEach(([c, v]) => { bal[c] = (bal[c] || 0) + v; });
      const count = nonGroupExps.filter((e) => expenseInvolves(e, key)).length;
      return { name: p.name, email: p.email, pending: p.pending, directGroupId: p.directGroupId, bal, count };
    })
    // Hide empty leftovers: a person with no expenses AND no balance (e.g. a
    // stray/abandoned direct thread) shouldn't clutter the list.
    .filter((p) => p.count > 0 || Object.values(p.bal).some((v) => Math.abs(v) > 0.01))
    .sort((a, b) => a.name.localeCompare(b.name));
};

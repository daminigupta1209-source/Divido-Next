import { describe, it, expect } from 'vitest';
import { buildDirectThreads, computeNonGroupPeople, makeIsMe, resolveNonGroupFriendKey, nonGroupFriendsFromExpenses, isNonGroupFriendKey } from './nonGroupPeople';
import { Expense, Group } from './types';

const mkExp = (o: Partial<Expense>): Expense =>
  ({ id: 'e', gId: 'STANDALONE', title: 't', amt: 0, paid: '', date: '2026-01-01', mode: 'Equally', splitters: [], ...o } as unknown as Expense);

describe('computeNonGroupPeople (self-only expenses)', () => {
  it('returns [] when the only STANDALONE expense is self-only', () => {
    const exps = [mkExp({ paid: 'Chirag', splitters: ['Chirag'] })];
    const out = computeNonGroupPeople(exps, [], makeIsMe('Chirag'), () => ({}));
    expect(out).toEqual([]);
  });

  it('returns exactly one entry (Rahul) when a self-only expense is mixed with a Chirag/Rahul expense', () => {
    const exps = [
      mkExp({ id: 'self', paid: 'Chirag', splitters: ['Chirag'] }),
      mkExp({ id: 'shared', paid: 'Chirag', splitters: ['Chirag', 'Rahul'] }),
    ];
    const out = computeNonGroupPeople(exps, [], makeIsMe('Chirag'), () => ({}));
    expect(out.length).toBe(1);
    expect(out[0].name).toBe('Rahul');
  });
});

describe('computeNonGroupPeople (same email, different names)', () => {
  const EM = 'damini@example.com';
  // Per-name STANDALONE balances (person's net: negative = they owe me).
  const balances: Record<string, Record<string, number>> = {
    'Damini Gupta': { '₹': 50 },
    'Damini Guptaaa': { '₹': -750 },
    Dee: { '₹': 750 },
  };
  const getBal = (_g: string | number, n: string) => balances[n] || {};

  it('merges names sharing an email into one person and sums their balances', () => {
    const exps = [
      mkExp({ id: 'a', timestamp: 1, paid: 'Chirag', splitters: ['Chirag', 'Damini Gupta'], otherEmail: EM }),
      mkExp({ id: 'b', timestamp: 3, paid: 'Damini Guptaaa', splitters: ['Chirag', 'Damini Guptaaa'], otherEmail: EM }),
      mkExp({ id: 'c', timestamp: 2, paid: 'Chirag', splitters: ['Chirag', 'Dee'], otherEmail: EM }),
    ];
    const out = computeNonGroupPeople(exps, [], makeIsMe('Chirag'), getBal);
    expect(out.length).toBe(1);
    expect(out[0].email).toBe(EM);
    expect(out[0].aliases.sort()).toEqual(['Damini Gupta', 'Damini Guptaaa', 'Dee']);
    expect(out[0].bal['₹']).toBe(50);
    expect(out[0].count).toBe(3);
    // No shared thread → the newest expense's name is shown.
    expect(out[0].name).toBe('Damini Guptaaa');
  });

  it('prefers the shared-thread name and counts the thread balance once', () => {
    const exps = [
      mkExp({ id: 'a', timestamp: 9, paid: 'Chirag', splitters: ['Chirag', 'Damini Guptaaa'], otherEmail: EM }),
      mkExp({ id: 't', gId: 'G1', timestamp: 1, paid: 'Chirag', splitters: ['Chirag', 'Damini Gupta'] }),
    ];
    const threads = [{ groupId: 'G1', otherName: 'Damini Gupta', email: EM, pending: false }];
    const out = computeNonGroupPeople(exps, threads, makeIsMe('Chirag'), (g, n) => (g === 'G1' ? { '₹': 100 } : getBal(g, n)));
    expect(out.length).toBe(1);
    expect(out[0].name).toBe('Damini Gupta');
    expect(out[0].directGroupId).toBe('G1');
    expect(out[0].bal['₹']).toBe(100 - 750);
  });

  it('keeps people with different emails separate, and a name with no email joins its emailed sighting', () => {
    const exps = [
      mkExp({ id: 'a', timestamp: 1, paid: 'Chirag', splitters: ['Chirag', 'Rahul'], otherEmail: 'rahul@example.com' }),
      mkExp({ id: 'b', timestamp: 2, paid: 'Chirag', splitters: ['Chirag', 'Rahul'] }),
      mkExp({ id: 'c', timestamp: 3, paid: 'Chirag', splitters: ['Chirag', 'Damini Gupta'], otherEmail: EM }),
    ];
    const out = computeNonGroupPeople(exps, [], makeIsMe('Chirag'), getBal);
    expect(out.map((p) => p.name)).toEqual(['Damini Gupta', 'Rahul']);
    expect(out.find((p) => p.name === 'Rahul')!.count).toBe(2);
  });
});

describe('buildDirectThreads (joiner kept the sharer-typed name)', () => {
  it('finds MY spot by email and reports it as myName, the sharer as otherName', () => {
    const g = {
      id: 'T1', name: 'Damini & Swami Chinmayanand', currency: '₹', isDirect: true,
      members: ['Damini', 'Swami Chinmayanand'], pendingMembers: [],
      memberIdentities: { Damini: 'damini@example.com', 'Swami Chinmayanand': 'chirag@example.com' },
    } as unknown as Group;
    const [t] = buildDirectThreads([g], 'Chirag', 'Chirag Gupta', 'chirag@example.com');
    expect(t.otherName).toBe('Damini');
    expect(t.myName).toBe('Swami Chinmayanand');
    expect(t.pending).toBe(false);
  });
});

describe('makeIsMe with a known full name', () => {
  it('does not treat a friend who shares my first name as me', () => {
    const isMe = makeIsMe('Damini', 'Damini Investment');
    expect(isMe('Damini')).toBe(true);
    expect(isMe('Damini Investment')).toBe(true);
    expect(isMe('Damini Gupta')).toBe(false);
  });
  it('still guesses from the first name when the full name is unknown', () => {
    expect(makeIsMe('Chirag')('Chirag Gupta')).toBe(true);
  });
});

describe('Non-Group friend ids', () => {
  const isMe = makeIsMe('Damini', 'Damini Investment');
  const ex = (over: Record<string, unknown>) => ({ id: String(Math.random()), gId: 'STANDALONE', title: 't', amt: 10, paid: 'Damini', date: '2026-10-01', mode: 'Equally', splitters: ['Damini', 'Ravi'], ...over }) as any;
  it('reuses the id already used with that email', () => {
    const exps = [ex({ otherKey: 'ngp-a', otherEmail: 'ravi@x.com' })];
    expect(resolveNonGroupFriendKey(exps, { name: 'Ravi Kumar', email: 'ravi@x.com' }, isMe)).toBe('ngp-a');
  });
  it('reuses the single id used with that name when no email', () => {
    const exps = [ex({ otherKey: 'ngp-a' })];
    expect(resolveNonGroupFriendKey(exps, { name: 'Ravi' }, isMe)).toBe('ngp-a');
  });
  it('gives a new id for a new email, even with the same name', () => {
    const exps = [ex({ otherKey: 'ngp-a', otherEmail: 'ravi@x.com' })];
    const k = resolveNonGroupFriendKey(exps, { name: 'Ravi', email: 'ravi2@x.com' }, isMe);
    expect(k).not.toBe('ngp-a');
    expect(isNonGroupFriendKey(k)).toBe(true);
  });
  it('keeps the id a pick already carries', () => {
    expect(resolveNonGroupFriendKey([], { name: 'Ravi', identity: 'ngp-z' }, isMe)).toBe('ngp-z');
  });
  it('lists one friend per id with the newest name', () => {
    const exps = [ex({ otherKey: 'ngp-a', timestamp: 1 }), ex({ otherKey: 'ngp-a', timestamp: 2, splitters: ['Damini', 'Ravi K'] })];
    expect(nonGroupFriendsFromExpenses(exps, isMe)).toEqual([{ name: 'Ravi K', email: '', key: 'ngp-a' }]);
  });
});

import { describe, it, expect } from 'vitest';
import { computeNonGroupPeople, makeIsMe } from './nonGroupPeople';
import { Expense } from './types';

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

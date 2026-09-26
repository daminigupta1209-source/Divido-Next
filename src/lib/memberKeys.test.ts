import { describe, it, expect } from 'vitest';
import { resolveMemberKey, fillPartyKeys } from './identity';
import { Group, Expense } from './types';

const grp = (memberKeys?: Record<string, string>, memberIdentities?: Record<string, string>): Group =>
  ({ id: 'g1', name: 'T', currency: '₹', members: Object.keys(memberKeys || {}), memberKeys, memberIdentities } as unknown as Group);

const exp = (o: Partial<Expense>): Expense =>
  ({ id: 'e', gId: 'g1', title: 't', amt: 100, paid: '', date: '2026-01-01', mode: 'Equally', splitters: [], ...o } as unknown as Expense);

describe('resolveMemberKey', () => {
  const g = grp(
    { 'Damini Gupta': 'k-dg', 'Ravi': 'k-ravi', 'Ram (Left)': 'k-ram', 'Damini Gupta (Ss)': 'k-dg2' },
    { 'Damini Gupta': 'daminigupta1209@gmail.com', 'Ravi': 'pid-1', 'Damini Gupta (Ss)': 'ss@gmail.com' },
  );

  it('matches exact, case-insensitive and "(Left)" names', () => {
    expect(resolveMemberKey(g, 'Ravi')).toBe('k-ravi');
    expect(resolveMemberKey(g, 'ravi')).toBe('k-ravi');
    expect(resolveMemberKey(g, 'Ram')).toBe('k-ram');
    expect(resolveMemberKey(g, 'Damini Gupta (Ss)')).toBe('k-dg2');
  });

  it('maps an email written in place of a name to that member', () => {
    expect(resolveMemberKey(g, 'ss@gmail.com')).toBe('k-dg2');
  });

  it('never guesses: ambiguous first names and unknown names stay unkeyed', () => {
    // "Damini" could be either Damini Gupta → no key.
    expect(resolveMemberKey(g, 'Damini')).toBeUndefined();
    expect(resolveMemberKey(g, 'Stranger')).toBeUndefined();
    expect(resolveMemberKey(g, 'SYSTEM')).toBeUndefined();
    expect(resolveMemberKey(grp(undefined), 'Ravi')).toBeUndefined();
  });

  it('resolves an unambiguous first name', () => {
    expect(resolveMemberKey(grp({ 'Damini Gupta': 'k1', Ravi: 'k2' }), 'Damini')).toBe('k1');
  });

  it('prefers the live row when a name has a live and a "(Left)" row', () => {
    expect(resolveMemberKey(grp({ Ram: 'k-live', 'Ram (Left)': 'k-old' }), 'Ram')).toBe('k-live');
  });
});

describe('fillPartyKeys', () => {
  const g = grp({ Ravi: 'k-ravi', Asha: 'k-asha' });

  it('keys payer, splitters and share names; skips SYSTEM and unknowns', () => {
    const out = fillPartyKeys(exp({ paid: 'Ravi', splitters: ['Ravi', 'Asha', 'Ghost'], shares: { Asha: 40 } }), g);
    expect(out?.partyKeys).toEqual({ Ravi: 'k-ravi', Asha: 'k-asha' });
    expect(fillPartyKeys(exp({ paid: 'SYSTEM' }), g)).toBeNull();
  });

  it('is idempotent and never overwrites an existing key', () => {
    const e = exp({ paid: 'Ravi', splitters: ['Ravi', 'Asha'], partyKeys: { Ravi: 'k-original' } });
    const once = fillPartyKeys(e, g)!;
    expect(once.partyKeys).toEqual({ Ravi: 'k-original', Asha: 'k-asha' });
    expect(fillPartyKeys(once, g)).toBeNull();
  });

  it('does nothing for groups without member keys', () => {
    expect(fillPartyKeys(exp({ paid: 'Ravi', splitters: ['Ravi'] }), grp(undefined))).toBeNull();
  });

  it('leaves the money fields untouched', () => {
    const e = exp({ paid: 'Ravi', splitters: ['Ravi', 'Asha'], shares: { Ravi: 60, Asha: 40 }, amt: 100 });
    const out = fillPartyKeys(e, g)!;
    expect({ ...out, partyKeys: undefined }).toEqual({ ...e, partyKeys: undefined });
  });
});

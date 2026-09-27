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

import { balancesByIdentity } from './identity';

describe('balancesByIdentity with member keys', () => {
  const mkG = (o: Partial<Group>): Group => ({ id: 'g1', name: 'T', currency: '₹', ...o } as unknown as Group);

  it('is unchanged when expense names already match the roster', () => {
    const base = { members: ['Ravi', 'Asha'], memberIdentities: { Ravi: 'r@x.com', Asha: 'pid-a' } };
    const e = [exp({ paid: 'Ravi', splitters: ['Ravi', 'Asha'], amt: 100 })];
    const without = balancesByIdentity(mkG(base), e, false);
    const withKeys = balancesByIdentity(
      mkG({ ...base, memberKeys: { Ravi: 'k-r', Asha: 'k-a' } }),
      [{ ...e[0], partyKeys: { Ravi: 'k-r', Asha: 'k-a' } }],
      false,
    );
    expect(withKeys).toEqual(without);
  });

  it('follows the member after a rename/claim instead of creating a phantom', () => {
    // Expense was written when the placeholder was "Raha"; she then claimed
    // with a different Google name, so the roster now says "Raha Sharma".
    const g = mkG({
      members: ['Ravi', 'Raha Sharma'],
      memberIdentities: { Ravi: 'r@x.com', 'Raha Sharma': 'raha.s@gmail.com' },
      memberKeys: { Ravi: 'k-r', 'Raha Sharma': 'k-raha' },
    });
    const e = exp({ paid: 'Ravi', splitters: ['Ravi', 'Raha'], amt: 100, partyKeys: { Ravi: 'k-r', Raha: 'k-raha' } });
    const tx = balancesByIdentity(g, [e], false);
    expect(tx).toHaveLength(1);
    expect(tx[0].from).toBe('Raha Sharma');
    expect(tx[0].to).toBe('Ravi');
    expect(tx[0].balances['₹']).toBeCloseTo(50);
  });

  it('keeps two same-named members apart when their emails differ', () => {
    const g = mkG({
      members: ['Me', 'Damini Gupta', 'Damini Gupta (Ss)'],
      memberIdentities: { Me: 'me@x.com', 'Damini Gupta': 'dg@gmail.com', 'Damini Gupta (Ss)': 'ss@gmail.com' },
      memberKeys: { Me: 'k-me', 'Damini Gupta': 'k-1', 'Damini Gupta (Ss)': 'k-2' },
    });
    const e = exp({ paid: 'Me', splitters: ['Me', 'Damini Gupta (Ss)'], amt: 100, partyKeys: { Me: 'k-me', 'Damini Gupta (Ss)': 'k-2' } });
    const tx = balancesByIdentity(g, [e], false);
    expect(tx).toHaveLength(1);
    expect(tx[0].from).toBe('Damini Gupta (Ss)');
  });
});

import { withoutEmailTag } from './identity';

describe('withoutEmailTag', () => {
  const g = { id: 'g1', name: 'T', currency: '₹', members: [], memberIdentities: {
    'Damini Gupta (Ss)': 'ss@gmail.com', 'Ram (Delhi)': 'ram@x.com', 'Asha (Dg.work) (Left)': 'dg.work@gmail.com',
  } } as unknown as Group;
  it('hides an auto tag that matches the member email (any case)', () => {
    expect(withoutEmailTag(g, 'Damini Gupta (Ss)')).toBe('Damini Gupta');
    expect(withoutEmailTag(g, 'Asha (Dg.work) (Left)')).toBe('Asha (Left)');
  });
  it('keeps real brackets and names without a matching email', () => {
    expect(withoutEmailTag(g, 'Ram (Delhi)')).toBe('Ram (Delhi)');
    expect(withoutEmailTag(g, 'Stranger (Ss)')).toBe('Stranger (Ss)');
    expect(withoutEmailTag(g, 'Ravi')).toBe('Ravi');
  });
});

import { pickerLabel } from './identity';

describe('pickerLabel', () => {
  const g = { id: 'g1', name: 'T', currency: '₹', members: [], memberIdentities: {
    'Damini Gupta': 'dg@gmail.com', 'Damini Gupta (Ss)': 'ss@gmail.com', Ravi: 'pid-r',
  } } as unknown as Group;
  const roster = ['Damini Gupta', 'Damini Gupta (Ss)', 'Ravi'];
  it('shows email for look-alike names, plain name otherwise', () => {
    expect(pickerLabel(g, 'Damini Gupta (Ss)', roster)).toBe('Damini Gupta · ss@gmail.com');
    expect(pickerLabel(g, 'Damini Gupta', roster)).toBe('Damini Gupta · dg@gmail.com');
    expect(pickerLabel(g, 'Ravi', roster)).toBe('Ravi');
  });
});

import { uniqueProfileName } from './identity';

describe('uniqueProfileName', () => {
  it('keeps the profile name when free, tags it with the email when taken', () => {
    expect(uniqueProfileName('Vandana Investment', 'v@x.com', new Set(['ravi']))).toBe('Vandana Investment');
    const tagged = uniqueProfileName('Vandana Investment', 'vandana.g@gmail.com', new Set(['vandana investment']));
    expect(tagged).toBe('Vandana Investment (vandana.g)');
    const g = { id: 'g', name: 'T', currency: '₹', members: [], memberIdentities: { [tagged]: 'vandana.g@gmail.com' } } as unknown as Group;
    expect(withoutEmailTag(g, tagged)).toBe('Vandana Investment');
  });
});

import { activityName } from './identity';

describe('activityName', () => {
  const g = { id: 'g', name: 'T', currency: '₹', members: ['Vandana Investment', 'Vandana Investment (Vandanaguptainvestment)', 'Ravi'], memberIdentities: {
    'Vandana Investment': 'vandana.work@gmail.com', 'Vandana Investment (Vandanaguptainvestment)': 'vandanaguptainvestment@gmail.com', Ravi: 'pid',
  } } as unknown as Group;
  it('hides the tag and adds a short email hint only for look-alikes', () => {
    expect(activityName(g, 'Vandana Investment (Vandanaguptainvestment)')).toBe('Vandana Investment (vandanagupt…)');
    expect(activityName(g, 'Vandana Investment')).toBe('Vandana Investment (vandana.wor…)');
    expect(activityName(g, 'Ravi')).toBe('Ravi');
  });
});

import { currentMemberName } from './identity';

describe('currentMemberName', () => {
  const g = { id: 'g', name: 'T', currency: '₹', members: ['Vandana Investment (Chiraggupta1990)', 'Damini Gupta'],
    memberKeys: { 'Vandana Investment (Chiraggupta1990)': 'k-c', 'Damini Gupta': 'k-d' } } as unknown as Group;
  it('maps a pre-rename name to the current roster name via the recorded key', () => {
    const e = exp({ paid: 'Chirag Gupta', partyKeys: { 'Chirag Gupta': 'k-c' } });
    expect(currentMemberName(g, e, 'Chirag Gupta')).toBe('Vandana Investment (Chiraggupta1990)');
    expect(currentMemberName(g, e, 'damini gupta')).toBe('Damini Gupta');
    expect(currentMemberName(g, e, 'Stranger')).toBe('Stranger');
  });
});

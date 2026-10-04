import { describe, it, expect } from 'vitest';
import { resolveMemberKey, fillPartyKeys, deriveKeyColumns, sameShareMap, memberNamesByKey, applyKeyNames } from './identity';
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
  it('hides the tag and adds the email only for look-alikes', () => {
    expect(activityName(g, 'Vandana Investment (Vandanaguptainvestment)')).toBe('Vandana Investment · vandanaguptainvestment@gmail.com');
    expect(activityName(g, 'Vandana Investment')).toBe('Vandana Investment · vandana.work@gmail.com');
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

import { buildNameIdentityResolver } from './identity';

describe('buildNameIdentityResolver', () => {
  const g1 = { id: 'a', name: 'Raipur', currency: '₹', members: ['Chhutki', 'Didi'], memberIdentities: { Chhutki: 'pid-c', Didi: 'pid-d1' } } as unknown as Group;
  const g2 = { id: 'b', name: 'Kota', currency: '₹', members: ['Didi'], memberIdentities: { Didi: 'pid-d2' } } as unknown as Group;
  it('resolves a name that means exactly one person, not an ambiguous one', () => {
    const r = buildNameIdentityResolver([g1, g2]);
    expect(r('chhutki')).toBe('pid-c');
    expect(r('Didi')).toBeUndefined();
    expect(r('Stranger')).toBeUndefined();
  });
});

describe('deriveKeyColumns (permanent ID step 2)', () => {
  const base = { id: 'x', gId: 'g1', title: 't', amt: 100, date: '2026-10-04', currency: '?' } as unknown as Expense;
  it('maps payer, splitters (same order) and shares to member keys', () => {
    const e = { ...base, paid: 'Ravi', splitters: ['Asha', 'Ravi'], shares: { Asha: 40, Ravi: 60 }, partyKeys: { Ravi: 'k-r', asha: 'k-a' } } as Expense;
    expect(deriveKeyColumns(e)).toEqual({ paidKey: 'k-r', splitterKeys: ['k-a', 'k-r'], sharesByKey: { 'k-a': 40, 'k-r': 60 } });
  });
  it('sends nothing when any name has no key (the database fills it)', () => {
    const e = { ...base, paid: 'Ravi', splitters: ['Ravi', 'Ghost'], partyKeys: { Ravi: 'k-r' } } as Expense;
    expect(deriveKeyColumns(e)).toBeNull();
  });
  it('skips SYSTEM notes and Non-Group expenses', () => {
    expect(deriveKeyColumns({ ...base, paid: 'SYSTEM', splitters: [] } as Expense)).toBeNull();
    expect(deriveKeyColumns({ ...base, gId: 'STANDALONE', paid: 'Ravi', splitters: ['Ravi'], partyKeys: { Ravi: 'k' } } as Expense)).toBeNull();
  });
  it('sameShareMap ignores key order and number-vs-string', () => {
    expect(sameShareMap({ a: 1, b: '2' }, { b: 2, a: 1 })).toBe(true);
    expect(sameShareMap({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameShareMap(undefined, undefined)).toBe(true);
  });
});

describe('applyKeyNames (permanent ID step 3a)', () => {
  const g = { id: 'g1', name: 'G', members: ['Rahul', 'Asha', 'Old (Left)'], memberKeys: { Rahul: 'k-r', Asha: 'k-a', 'Old (Left)': 'k-o' } } as unknown as Group;
  const names = memberNamesByKey(g);
  const base = { id: 'x', gId: 'g1', title: 't', amt: 100, date: '2026-10-04', currency: '?' } as unknown as Expense;
  it('shows the current roster name for a renamed member', () => {
    const e = { ...base, paid: 'Ravi', splitters: ['Ravi', 'Asha'], shares: { Ravi: 60, Asha: 40 }, partyKeys: { Ravi: 'k-r', Asha: 'k-a' }, paidKey: 'k-r', splitterKeys: ['k-r', 'k-a'] } as Expense;
    const v = applyKeyNames(e, g, names);
    expect(v.paid).toBe('Rahul');
    expect(v.splitters).toEqual(['Rahul', 'Asha']);
    expect(v.shares).toEqual({ Rahul: 60, Asha: 40 });
    expect(v.partyKeys!.Rahul).toBe('k-r');
  });
  it('returns the same object when nothing changed', () => {
    const e = { ...base, paid: 'Asha', splitters: ['Asha'], paidKey: 'k-a', splitterKeys: ['k-a'] } as Expense;
    expect(applyKeyNames(e, g, names)).toBe(e);
  });
  it('drops "(Left)" and keeps stored names for unknown or name: keys', () => {
    const e = { ...base, paid: 'Ghost', splitters: ['Ghost', 'Old'], paidKey: 'name:Ghost', splitterKeys: ['name:Ghost', 'k-o'] } as Expense;
    const v = applyKeyNames(e, g, names);
    expect(v.paid).toBe('Ghost');
    expect(v.splitters).toEqual(['Ghost', 'Old']);
  });
  it('shows the full roster name for an expense written with the first name', () => {
    const g2 = { ...g, members: ['Ravi Kumar'], memberKeys: { 'Ravi Kumar': 'k-r' } } as unknown as Group;
    const e = { ...base, paid: 'Ravi', splitters: ['Ravi'], paidKey: 'k-r', splitterKeys: ['k-r'] } as Expense;
    expect(applyKeyNames(e, g2, memberNamesByKey(g2)).paid).toBe('Ravi Kumar');
  });
  it('leaves expenses without keys untouched', () => {
    const e = { ...base, paid: 'Ravi', splitters: ['Ravi'] } as Expense;
    expect(applyKeyNames(e, g, names)).toBe(e);
  });
});

import { setDisplayGroups, shown } from './identity';
describe('shown (hidden tag never displayed)', () => {
  it('strips a registered email tag, keeps real brackets', () => {
    const g = { id: 'g', name: 'G', members: ['Esha Gupta', 'Esha Gupta (esha1990)', 'Ram (Delhi)', 'Old (old1) (Left)'], memberIdentities: { 'Esha Gupta': 'eshadgupta1993@gmail.com', 'Esha Gupta (esha1990)': 'esha1990@gmail.com', 'Old (old1) (Left)': 'old1@x.com' } } as unknown as Group;
    setDisplayGroups([g]);
    expect(shown('Esha Gupta (esha1990)')).toBe('Esha Gupta');
    expect(shown('Esha Gupta')).toBe('Esha Gupta');
    expect(shown('Ram (Delhi)')).toBe('Ram (Delhi)');
    expect(shown('Old (old1)')).toBe('Old');
    expect(shown(undefined)).toBe('');
    setDisplayGroups([]);
  });
});

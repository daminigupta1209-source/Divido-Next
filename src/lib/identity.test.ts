import { describe, it, expect } from 'vitest';
import { getPersonKey, cleanMemberName, balancesByIdentity, buildKeyToName } from './identity';
import { Group, Expense } from './types';

const mkGroup = (memberIdentities?: Record<string, string>, members: string[] = []): Group =>
  ({ id: 'g1', name: 'Test', currency: '₹', members, memberIdentities } as unknown as Group);

const mkExp = (o: Partial<Expense>): Expense =>
  ({ id: 'e', gId: 'g1', title: 't', amt: 0, paid: '', date: '2026-01-01', mode: 'Equally', splitters: [], ...o } as unknown as Expense);

describe('getPersonKey', () => {
  it('returns the recorded identity for a name (email or person_id)', () => {
    const g = mkGroup({ Bhaiya: 'chirag@x.com', Ram: 'pid-123' });
    expect(getPersonKey(g, 'Bhaiya')).toBe('chirag@x.com');
    expect(getPersonKey(g, 'Ram')).toBe('pid-123');
  });

  it('falls back to the "(Left)" variant when the plain name has no entry', () => {
    const g = mkGroup({ 'Ram (Left)': 'pid-999' });
    expect(getPersonKey(g, 'Ram')).toBe('pid-999');
  });

  it('matches case-insensitively (expense "didi" resolves to roster "Didi")', () => {
    const g = mkGroup({ Didi: 'pid-didi' });
    expect(getPersonKey(g, 'didi')).toBe('pid-didi');
    expect(getPersonKey(g, 'DIDI')).toBe('pid-didi');
    expect(getPersonKey(g, 'didi (Left)')).toBe('pid-didi');
  });

  it('falls back to the raw name for legacy/unlinked members', () => {
    const g = mkGroup({ Someone: 'pid-1' });
    expect(getPersonKey(g, 'Zara')).toBe('Zara');
  });

  it('falls back to the raw name when there is no identity map at all', () => {
    expect(getPersonKey(mkGroup(undefined), 'Zara')).toBe('Zara');
    expect(getPersonKey(undefined, 'Zara')).toBe('Zara');
    expect(getPersonKey(null, 'Zara')).toBe('Zara');
  });
});

describe('cleanMemberName', () => {
  it('strips the (Left) and (me) suffixes', () => {
    expect(cleanMemberName('Ram (Left)')).toBe('Ram');
    expect(cleanMemberName('Chirag (me)')).toBe('Chirag');
    expect(cleanMemberName('Plain Name')).toBe('Plain Name');
  });
});

describe('buildKeyToName', () => {
  it('prefers the live roster name over a (Left) variant for the same key', () => {
    // Both entries resolve to the same person_id key.
    const g = mkGroup({ Ram: 'pid-7', 'Ram (Left)': 'pid-7' }, ['Ram', 'Ram (Left)']);
    expect(buildKeyToName(g)['pid-7']).toBe('Ram');
  });
});

describe('balancesByIdentity', () => {
  it('merges a left member (expenses say "Ram", roster says "Ram (Left)") into ONE balance', () => {
    // Chirag paid 100, split equally with Ram. Ram later left, so the roster
    // carries "Ram (Left)" while the expense still names "Ram". Both must map to
    // the same person and net to a single Ram-owes-Chirag-50 entry.
    const g = mkGroup(
      { Chirag: 'chirag@x.com', 'Ram (Left)': 'pid-ram' },
      ['Chirag', 'Ram (Left)'],
    );
    const exps = [mkExp({ paid: 'Chirag', amt: 100, splitters: ['Chirag', 'Ram'], mode: 'Equally' })];
    const txns = balancesByIdentity(g, exps, false);
    expect(txns.length).toBe(1);
    expect(txns[0].from).toBe('Ram');       // debtor shown by clean live-ish name
    expect(txns[0].to).toBe('Chirag');
    expect(txns[0].balances['₹']).toBeCloseTo(50);
  });

  it('keeps two DIFFERENT people who share a name separate (distinct keys)', () => {
    // Two "Ram"s with different identities must not merge.
    const g = mkGroup(
      { Chirag: 'chirag@x.com', Ram: 'pid-a', 'Ram ': 'pid-b' },
      ['Chirag', 'Ram', 'Ram '],
    );
    // Only the first Ram (pid-a) is involved here; balance should be just 50.
    const exps = [mkExp({ paid: 'Chirag', amt: 100, splitters: ['Chirag', 'Ram'], mode: 'Equally' })];
    const txns = balancesByIdentity(g, exps, false);
    expect(txns.length).toBe(1);
    expect(txns[0].balances['₹']).toBeCloseTo(50);
  });
});

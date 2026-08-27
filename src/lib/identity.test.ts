import { describe, it, expect } from 'vitest';
import { getPersonKey, cleanMemberName } from './identity';
import { Group } from './types';

const mkGroup = (memberIdentities?: Record<string, string>): Group =>
  ({ id: 'g1', name: 'Test', currency: '₹', members: [], memberIdentities } as unknown as Group);

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

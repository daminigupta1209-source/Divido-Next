import { describe, it, expect } from 'vitest';
import { pendingNamesFor, isActiveGroup, computeJoinProgress, detectCelebration, toSnapshot, joinNames } from './joinProgress';
import { Group, Expense } from './types';

const NOW = new Date('2026-09-30T12:00:00Z').getTime();

const grp = (o: Partial<Group>): Group =>
  ({ id: 'g1', name: 'Goa', currency: '₹', members: [], pendingMembers: [], createdDate: '2026-09-20', ...o } as Group);

const exp = (o: Partial<Expense>): Expense =>
  ({ id: 'e', gId: 'g1', title: 't', amt: 100, paid: 'Me', date: '2026-09-25', ...o } as Expense);

const meFor = () => 'Me';

describe('pendingNamesFor', () => {
  it('excludes me, left, removed and stale pending entries', () => {
    const g = grp({
      members: ['Me', 'Rahul', 'Priya', 'Amit (Left)', 'Old'],
      pendingMembers: ['Me', 'Rahul', 'Priya', 'Amit', 'Old', 'Ghost'],
      removedMembers: ['Old'],
    });
    expect(pendingNamesFor(g, 'Me')).toEqual(['Rahul', 'Priya']);
  });

  it('strips the (me) suffix and returns nothing for direct threads', () => {
    expect(pendingNamesFor(grp({ members: ['Me (me)', 'A'], pendingMembers: ['Me (me)', 'A'] }), 'Me')).toEqual(['A']);
    expect(pendingNamesFor(grp({ isDirect: true, members: ['Me', 'A'], pendingMembers: ['A'] }), 'Me')).toEqual([]);
  });
});

describe('isActiveGroup', () => {
  it('uses the latest non-deleted expense, else createdDate', () => {
    const old = grp({ createdDate: '2025-01-01' });
    expect(isActiveGroup(old, [], NOW)).toBe(false);
    expect(isActiveGroup(old, [exp({ date: '2026-09-01' })], NOW)).toBe(true);
    expect(isActiveGroup(old, [exp({ date: '2026-09-01', isDeleted: true })], NOW)).toBe(false);
    expect(isActiveGroup(grp({ createdDate: undefined }), [], NOW)).toBe(true);
  });
});

describe('computeJoinProgress', () => {
  it('dedupes a person pending in two groups by identity and skips inactive groups', () => {
    const a = grp({ id: 'a', members: ['Me', 'Rahul', 'Priya'], pendingMembers: ['Rahul'], memberIdentities: { Rahul: 'r@x.com' } });
    const b = grp({ id: 'b', name: 'Flat', members: ['Me', 'Rahul K', 'Neha'], pendingMembers: ['Rahul K', 'Neha'], memberIdentities: { 'Rahul K': 'r@x.com' } });
    const stale = grp({ id: 'c', createdDate: '2024-01-01', members: ['Me', 'Z'], pendingMembers: ['Z'] });
    const p = computeJoinProgress([a, b, stale], [], meFor, NOW);
    expect(p.pending.map((x) => x.name).sort()).toEqual(['Neha', 'Rahul']);
    expect(p.joinedKeys).toEqual(['priya']);
    expect(p.total).toBe(3);
    expect(p.perGroup.map((x) => x.group.id)).toEqual(['a', 'b']);
  });
});

describe('detectCelebration', () => {
  const before = computeJoinProgress([grp({ members: ['Me', 'Rahul', 'Priya'], pendingMembers: ['Rahul', 'Priya'] })], [], meFor, NOW);

  it('names people who moved from pending to joined', () => {
    const after = computeJoinProgress([grp({ members: ['Me', 'Rahul', 'Priya'], pendingMembers: ['Rahul'] })], [], meFor, NOW);
    expect(detectCelebration(toSnapshot(before), after)).toEqual({ kind: 'joined', people: [{ name: 'Priya', groupName: 'Goa' }] });
  });

  it('reports allDone when the last pending person joins', () => {
    const after = computeJoinProgress([grp({ members: ['Me', 'Rahul', 'Priya'], pendingMembers: [] })], [], meFor, NOW);
    expect(detectCelebration(toSnapshot(before), after)).toEqual({ kind: 'allDone' });
  });

  it('does not celebrate a cancelled invite or a first visit', () => {
    const after = computeJoinProgress([grp({ members: ['Me', 'Rahul'], pendingMembers: ['Rahul'] })], [], meFor, NOW);
    expect(detectCelebration(toSnapshot(before), after)).toBeNull();
    expect(detectCelebration(null, after)).toBeNull();
  });
});

describe('joinNames', () => {
  it('formats short and long lists', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B & C');
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B & 3 others');
  });
});

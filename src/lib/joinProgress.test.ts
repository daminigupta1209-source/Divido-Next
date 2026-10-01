import { describe, it, expect } from 'vitest';
import { pendingNamesFor, isActiveGroup, groupActivityTimestamp, computeJoinProgress, detectCelebration, toSnapshot, joinNames } from './joinProgress';
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

describe('groupActivityTimestamp', () => {
  it('matches the reference date isActiveGroup uses, and is null when there is none', () => {
    const g = grp({ createdDate: '2026-09-01' });
    expect(groupActivityTimestamp(g, [])).toBe(new Date('2026-09-01').getTime());
    expect(groupActivityTimestamp(g, [exp({ date: '2026-09-15' })])).toBe(new Date('2026-09-15').getTime());
    expect(groupActivityTimestamp(g, [exp({ date: '2026-09-15', isDeleted: true })])).toBe(new Date('2026-09-01').getTime());
    expect(groupActivityTimestamp(grp({ createdDate: undefined }), [])).toBeNull();
  });
});

describe('computeJoinProgress', () => {
  it('dedupes a person pending in two groups by identity and skips inactive groups', () => {
    const a = grp({ id: 'a', members: ['Me', 'Rahul', 'Priya'], pendingMembers: ['Rahul'], memberIdentities: { Rahul: 'r@x.com' } });
    const b = grp({ id: 'b', name: 'Flat', members: ['Me', 'Rahul K', 'Neha'], pendingMembers: ['Rahul K', 'Neha'], memberIdentities: { 'Rahul K': 'r@x.com' } });
    const stale = grp({ id: 'c', createdDate: '2024-01-01', members: ['Me', 'Z'], pendingMembers: ['Z'] });
    const p = computeJoinProgress([a, b, stale], [], meFor, NOW);
    // "Rahul K" (group b) is the same identity as "Rahul" (group a) and is the
    // longer/more complete name, so it wins for display.
    expect(p.pending.map((x) => x.name).sort()).toEqual(['Neha', 'Rahul K']);
    expect(p.joinedKeys).toEqual(['priya']);
    expect(p.total).toBe(3);
    expect(p.perGroup.map((x) => x.group.id)).toEqual(['a', 'b']);
  });
});

describe('computeJoinProgress spots and display name', () => {
  it('collects one spot per active group the person is pending in, resolving memberKeys case/suffix-insensitively', () => {
    const a = grp({
      id: 'a', name: 'Goa',
      members: ['Me', 'Rahul'], pendingMembers: ['Rahul'],
      memberIdentities: { Rahul: 'r@x.com' },
      memberKeys: { Rahul: 'key-a' },
      createdDate: '2026-09-10',
    });
    const b = grp({
      id: 'b', name: 'Flat',
      members: ['Me', 'Rahul K'], pendingMembers: ['Rahul K'],
      memberIdentities: { 'Rahul K': 'r@x.com' },
      memberKeys: { 'rahul k': 'key-b' }, // case-mismatched vs the roster spelling
      createdDate: '2026-09-20',
    });
    const c = grp({
      id: 'c', name: 'Trip',
      members: ['Me', 'Rahul Kumar'], pendingMembers: ['Rahul Kumar'],
      memberIdentities: { 'Rahul Kumar': 'r@x.com' },
      // no memberKeys on this group at all
      createdDate: '2026-09-25',
    });
    const p = computeJoinProgress([a, b, c], [], meFor, NOW);
    expect(p.pending).toHaveLength(1);
    const rahul = p.pending[0];
    expect(rahul.spots).toHaveLength(3);
    const byGroupId = Object.fromEntries(rahul.spots.map((s) => [String(s.group.id), s]));
    expect(byGroupId.a.memberName).toBe('Rahul');
    expect(byGroupId.a.memberKey).toBe('key-a');
    expect(byGroupId.b.memberName).toBe('Rahul K');
    expect(byGroupId.b.memberKey).toBe('key-b');
    expect(byGroupId.c.memberName).toBe('Rahul Kumar');
    expect(byGroupId.c.memberKey).toBeUndefined();
  });

  it('sorts by spot count desc, then latest activity of the most recent group desc, then name asc', () => {
    const a1 = grp({ id: 'a1', members: ['Me', 'Amit'], pendingMembers: ['Amit'], memberIdentities: { Amit: 'amit@x.com' }, createdDate: '2026-09-10' });
    const a2 = grp({ id: 'a2', members: ['Me', 'Amit'], pendingMembers: ['Amit'], memberIdentities: { Amit: 'amit@x.com' }, createdDate: '2026-09-15' });
    const a3 = grp({ id: 'a3', members: ['Me', 'Amit'], pendingMembers: ['Amit'], memberIdentities: { Amit: 'amit@x.com' }, createdDate: '2026-09-28' });
    const p1 = grp({ id: 'p1', members: ['Me', 'Priya'], pendingMembers: ['Priya'], memberIdentities: { Priya: 'priya@x.com' }, createdDate: '2026-09-20' });
    const z1 = grp({ id: 'z1', members: ['Me', 'Zara'], pendingMembers: ['Zara'], memberIdentities: { Zara: 'zara@x.com' }, createdDate: '2026-09-05' });
    const progress = computeJoinProgress([a1, a2, a3, p1, z1], [], meFor, NOW);
    // Amit: 3 spots, wins outright. Priya and Zara: 1 spot each, tied on count
    // but Priya's group (09-20) is more recently active than Zara's (09-05).
    expect(progress.pending.map((x) => x.name)).toEqual(['Amit', 'Priya', 'Zara']);
  });

  it('picks the longest clean name across the person\'s groups as the display name', () => {
    const a = grp({ id: 'a', members: ['Me', 'Rahul'], pendingMembers: ['Rahul'], memberIdentities: { Rahul: 'r2@x.com' } });
    const b = grp({ id: 'b', members: ['Me', 'Rahul Kumar'], pendingMembers: ['Rahul Kumar'], memberIdentities: { 'Rahul Kumar': 'r2@x.com' } });
    const progress = computeJoinProgress([a, b], [], meFor, NOW);
    expect(progress.pending).toHaveLength(1);
    expect(progress.pending[0].name).toBe('Rahul Kumar');
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

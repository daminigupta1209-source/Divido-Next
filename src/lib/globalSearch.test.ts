import { describe, it, expect } from 'vitest';
import {
  globalSearch,
  searchGroupsAndFriends,
  DEFAULT_SEARCH_LIMIT,
  SearchFriend,
} from './globalSearch';
import { Group } from './types';

const group = (over: Partial<Group> & { id: string; name: string }): Group => ({
  members: [],
  currency: '₹',
  ...over,
});

const friend = (over: Partial<SearchFriend> & { id: string; name: string }): SearchFriend => ({
  groups: [],
  bals: {},
  ...over,
});

describe('searchGroupsAndFriends / globalSearch', () => {
  it('returns empty lists for an empty or whitespace-only query', () => {
    const groups = [group({ id: 'g1', name: 'Goa Trip' })];
    const friends = [friend({ id: 'f1', name: 'Rahul' })];

    expect(searchGroupsAndFriends(groups, friends, '')).toEqual({ groups: [], friends: [] });
    expect(searchGroupsAndFriends(groups, friends, '   ')).toEqual({ groups: [], friends: [] });
    expect(globalSearch(groups, friends, '')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const groups = [group({ id: 'g1', name: 'Goa Trip' })];
    const { groups: result } = searchGroupsAndFriends(groups, [], 'GOA');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'group', id: 'g1', group: groups[0] });
  });

  it('matches diacritic-insensitively', () => {
    const friends = [friend({ id: 'f1', name: 'José' })];
    const { friends: result } = searchGroupsAndFriends([], friends, 'jose');
    expect(result).toHaveLength(1);
    expect(result[0].friend.id).toBe('f1');
  });

  it('ignores surrounding whitespace in the query', () => {
    const friends = [friend({ id: 'f1', name: 'Priya' })];
    const { friends: result } = searchGroupsAndFriends([], friends, '  priya  ');
    expect(result).toHaveLength(1);
  });

  it('ignores the trailing " (Left)" suffix on friend names when matching', () => {
    const friends = [friend({ id: 'f1', name: 'Amit (Left)' })];
    const { friends: result } = searchGroupsAndFriends([], friends, 'amit');
    expect(result).toHaveLength(1);
    expect(result[0].friend.name).toBe('Amit (Left)');
  });

  it('ignores the trailing " (me)" suffix on friend names when matching', () => {
    const friends = [friend({ id: 'f1', name: 'Chirag (me)' })];
    const { friends: result } = searchGroupsAndFriends([], friends, 'chirag');
    expect(result).toHaveLength(1);
  });

  it('ranks word-prefix and whole-prefix matches above mid-string substring matches', () => {
    const mixed = [
      friend({ id: 'a', name: 'Barai' }), // mid-string: contains "rai" but no word starts with it
      friend({ id: 'b', name: 'Raina' }), // whole-prefix: starts with "rai"
      friend({ id: 'c', name: 'Kolkata Raiders' }), // word-prefix: second word starts with "rai"
    ];
    const { friends: result } = searchGroupsAndFriends([], mixed, 'rai');
    // Both "Raina" (whole-prefix) and "Kolkata Raiders" (word-prefix) are tier
    // 0, so they sort alphabetically by full name ("kolkata..." < "raina")
    // ahead of "Barai", the tier-1 mid-string match.
    expect(result.map((r) => r.friend.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders alphabetically within the same match tier, stably for name ties', () => {
    const friends = [
      friend({ id: 'f1', name: 'Camila' }), // tier 1: "am" is mid-string, not a prefix
      friend({ id: 'f2', name: 'Amy' }), // tier 0: starts with "am"
      friend({ id: 'f3', name: 'amy' }), // tier 0, same normalized name as f2, later index
    ];
    const { friends: result } = searchGroupsAndFriends([], friends, 'am');
    expect(result.map((r) => r.friend.id)).toEqual(['f2', 'f3', 'f1']);
  });

  it('excludes isDirect groups', () => {
    const groups = [
      group({ id: 'g1', name: 'Me & Them', isDirect: true }),
      group({ id: 'g2', name: 'Melbourne Trip' }),
    ];
    const { groups: result } = searchGroupsAndFriends(groups, [], 'me');
    expect(result.map((r) => r.id)).toEqual(['g2']);
  });

  it('excludes empty-name placeholder groups', () => {
    const groups = [
      group({ id: 'g1', name: '' }),
      group({ id: 'g2', name: '   ' }),
      group({ id: 'g3', name: 'Real Group' }),
    ];
    const { groups: result } = searchGroupsAndFriends(groups, [], 'real');
    expect(result.map((r) => r.id)).toEqual(['g3']);
  });

  it('excludes groups and friends that do not match the query at all', () => {
    const groups = [group({ id: 'g1', name: 'Goa Trip' })];
    const friends = [friend({ id: 'f1', name: 'Rahul' })];
    const { groups: g, friends: f } = searchGroupsAndFriends(groups, friends, 'xyz');
    expect(g).toEqual([]);
    expect(f).toEqual([]);
  });

  it('keeps friends that share a display name but have different ids', () => {
    const friends = [
      friend({ id: 'f1', name: 'Amit' }),
      friend({ id: 'f2', name: 'Amit' }),
    ];
    const { friends: result } = searchGroupsAndFriends([], friends, 'amit');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.friend.id).sort()).toEqual(['f1', 'f2']);
  });

  it('caps each type at the given limitPerType', () => {
    const friends = Array.from({ length: 25 }, (_, i) =>
      friend({ id: `f${i}`, name: `Friend ${String(i).padStart(2, '0')}` })
    );
    const { friends: result } = searchGroupsAndFriends([], friends, 'friend', 5);
    expect(result).toHaveLength(5);
  });

  it('defaults the per-type cap to DEFAULT_SEARCH_LIMIT (20)', () => {
    expect(DEFAULT_SEARCH_LIMIT).toBe(20);
    const groups = Array.from({ length: 30 }, (_, i) => group({ id: `g${i}`, name: `Group ${i}` }));
    const { groups: result } = searchGroupsAndFriends(groups, [], 'group');
    expect(result).toHaveLength(20);
  });

  it('globalSearch returns one flattened, type-tagged list: ranked groups then ranked friends', () => {
    const groups = [group({ id: 'g1', name: 'Amity Group' })];
    const friends = [friend({ id: 'f1', name: 'Amit' })];
    const result = globalSearch(groups, friends, 'ami');
    expect(result).toEqual([
      { type: 'group', id: 'g1', group: groups[0] },
      { type: 'friend', friend: friends[0] },
    ]);
  });

  it('respects a custom limitPerType in globalSearch', () => {
    const groups = Array.from({ length: 10 }, (_, i) => group({ id: `g${i}`, name: `Group ${i}` }));
    const friends = Array.from({ length: 10 }, (_, i) => friend({ id: `f${i}`, name: `Group ${i}` }));
    const result = globalSearch(groups, friends, 'group', 3);
    expect(result.filter((r) => r.type === 'group')).toHaveLength(3);
    expect(result.filter((r) => r.type === 'friend')).toHaveLength(3);
  });
});

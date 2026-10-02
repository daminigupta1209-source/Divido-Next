// Pure, dependency-free search over the app's groups + derived friends list,
// used to power a single global search box (header / command-palette style).
// No React, no DOM, no network — callers own fetching `Group[]` and building
// the friends array (see FriendsView.tsx's `friends` reducer, ~line 374-379,
// for the shape this module expects as input).
//
// Matching is case-, diacritic- and surrounding-whitespace-insensitive, and
// ignores the ' (Left)' / ' (me)' display suffixes some member/friend names
// carry (see FriendsView.tsx ~line 300 and MobileHeader.tsx ~lines 128-131,
// which strip the same suffixes before comparing names).
//
// Group exclusion mirrors Home's group list filter (MasterSummary.tsx
// ~lines 349-355): "direct" (shared non-group) threads never appear, and
// name-less placeholder groups are hidden. MasterSummary also keeps an
// empty-name group visible if it already has expenses; this module has no
// expense list to consult, so — by design — ALL empty-name groups are
// treated as placeholders and excluded here. See module README/report for
// this deliberate simplification.

import { Group } from './types';

export const DEFAULT_SEARCH_LIMIT = 20;

// The shape FriendsView.tsx derives per friend (id, display name, the group
// labels they're shared in, and their per-currency balances with the user).
export interface SearchFriend {
  id: string;
  name: string;
  groups: string[];
  bals: Record<string, number>;
}

export interface GroupSearchResult {
  type: 'group';
  id: string | number;
  group: Group;
}

export interface FriendSearchResult {
  type: 'friend';
  friend: SearchFriend;
}

export type GlobalSearchResult = GroupSearchResult | FriendSearchResult;

export interface GlobalSearchResults {
  groups: GroupSearchResult[];
  friends: FriendSearchResult[];
}

// Strip diacritics, the ' (Left)' / ' (me)' display suffixes, surrounding
// whitespace, and case — so "José (Left)", " jose ", and "JOSÉ" all compare
// equal. Suffixes are stripped in the same order MobileHeader.tsx uses
// (me, then Left).
function normalizeName(raw: string): string {
  const trimmed = (raw || '').trim();
  const withoutSuffixes = trimmed
    .replace(/\s*\(me\)\s*$/i, '')
    .replace(/\s*\(left\)\s*$/i, '')
    .trim();
  return withoutSuffixes.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function normalizeQuery(raw: string): string {
  const trimmed = (raw || '').trim();
  return trimmed.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Match tiers: 0 = the name (or one of its whitespace-separated words) starts
// with the query; 1 = the query appears elsewhere, mid-string; null = no
// match at all (excluded from results).
function matchTier(normalizedName: string, normalizedQuery: string): 0 | 1 | null {
  if (!normalizedQuery || !normalizedName.includes(normalizedQuery)) return null;
  if (normalizedName.startsWith(normalizedQuery)) return 0;
  const isWordPrefixMatch = normalizedName
    .split(/\s+/)
    .some((word) => word.startsWith(normalizedQuery));
  return isWordPrefixMatch ? 0 : 1;
}

// Same exclusion as Home's group list (MasterSummary.tsx ~349-355): "direct"
// threads live under Non-Group Expenses, never in Groups; name-less groups
// are placeholders. MasterSummary also spares a name-less group that already
// has expenses — this module takes no expense list, so every name-less group
// is treated as a placeholder and excluded.
function isSearchableGroup(group: Group): boolean {
  if (group.isDirect) return false;
  if ((group.name || '').trim() === '') return false;
  return true;
}

interface RankedResult<T> {
  tier: 0 | 1;
  sortName: string;
  index: number;
  value: T;
}

function rankAndSort<T>(items: RankedResult<T>[]): T[] {
  return items
    .slice()
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const nameCompare = a.sortName.localeCompare(b.sortName);
      if (nameCompare !== 0) return nameCompare;
      return a.index - b.index; // stable tiebreak
    })
    .map((r) => r.value);
}

// Returns groups and friends as two independently ranked, capped sub-lists —
// each ordered prefix-matches-first, then alphabetically, stably — so a UI
// that sections results (e.g. a "Groups" heading and a "Friends" heading)
// doesn't need to re-derive that split from a flat list.
export function searchGroupsAndFriends(
  groups: Group[],
  friends: SearchFriend[],
  query: string,
  limitPerType: number = DEFAULT_SEARCH_LIMIT
): GlobalSearchResults {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return { groups: [], friends: [] };

  const rankedGroups: RankedResult<GroupSearchResult>[] = [];
  groups.forEach((group, index) => {
    if (!isSearchableGroup(group)) return;
    const normalizedName = normalizeName(group.name);
    const tier = matchTier(normalizedName, normalizedQuery);
    if (tier === null) return;
    rankedGroups.push({
      tier,
      sortName: normalizedName,
      index,
      value: { type: 'group', id: group.id, group },
    });
  });

  const rankedFriends: RankedResult<FriendSearchResult>[] = [];
  friends.forEach((friend, index) => {
    const normalizedName = normalizeName(friend.name);
    const tier = matchTier(normalizedName, normalizedQuery);
    if (tier === null) return;
    rankedFriends.push({
      tier,
      sortName: normalizedName,
      index,
      value: { type: 'friend', friend },
    });
  });

  return {
    groups: rankAndSort(rankedGroups).slice(0, limitPerType),
    friends: rankAndSort(rankedFriends).slice(0, limitPerType),
  };
}

// The same search, flattened into one ordered, type-tagged list: groups
// first (already ranked + capped), then friends (already ranked + capped).
export function globalSearch(
  groups: Group[],
  friends: SearchFriend[],
  query: string,
  limitPerType: number = DEFAULT_SEARCH_LIMIT
): GlobalSearchResult[] {
  const { groups: groupResults, friends: friendResults } = searchGroupsAndFriends(
    groups,
    friends,
    query,
    limitPerType
  );
  return [...groupResults, ...friendResults];
}

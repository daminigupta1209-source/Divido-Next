import { Group } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for resolving a member's DISPLAY NAME to a stable,
// rename-safe KEY within a group.
//
// Today people are matched to expenses/balances by their raw name string,
// which is fragile: rename someone and every copy of the name must be rewritten
// or balances orphan. This helper is the first step toward keying by a stable
// identity instead. The key priority is:
//   1. group.memberIdentities[name]          — the recorded identity
//      (lower(email) for signed-in members → person_id for name-only members),
//      built at load in useSupabaseSync from the group_members rows.
//   2. group.memberIdentities[name + ' (Left)'] — same, for a member who has
//      left (their roster entry carries the "(Left)" suffix).
//   3. the raw name itself — legacy / unlinked members keep the old
//      match-by-name behaviour, so nothing regresses.
//
// Every balance-bucketing caller should use THIS function rather than reaching
// into memberIdentities inline, so the resolution rule lives in one place.
// ─────────────────────────────────────────────────────────────────────────
export const getPersonKey = (group: Group | undefined | null, name: string): string =>
  (group?.memberIdentities?.[name]) ||
  (group?.memberIdentities?.[name + ' (Left)']) ||
  name;

// Strip the "(Left)" / "(me)" display suffixes to get the bare name. Kept here
// next to getPersonKey because both are about turning a raw member string into
// something comparable; callers that need the plain name for display use this.
export const cleanMemberName = (name: string): string =>
  name.replace(/\s*\((Left|me)\)\s*$/i, '').trim();

// ─────────────────────────────────────────────────────────────────────────
// When a placeholder ("name-only") group member is claimed by a real person
// who joins under a different display name, every expense in that group that
// still refers to the OLD placeholder name (as payer, splitter, or share key)
// must be rewritten to the NEW name so balances stay correct. This module is
// the pure, testable core of that rewrite — ported unchanged in behaviour
// from the two inline copies in App.tsx (invite auto-claim, ~line 2757, and
// runClaimPlaceholder, ~line 4015).
//
// RLS ORDERING CONTRACT (money-affecting — do not reorder at call sites):
// the group_members row update that claims the placeholder (sets name /
// user_email / is_pending) MUST be committed BEFORE these expense patches
// are written. The "expenses" RLS policy only allows access when the
// caller's email matches a row in group_members for that group_id (see
// api/supabase_setup.sql ~133-139), so writing expense patches before the
// claim lands would fail RLS (or, on a race, silently touch the wrong
// membership state).
// ─────────────────────────────────────────────────────────────────────────

// Shape of a row as returned by `supabase.from('expenses').select('*')`.
// Only the fields this rewrite touches are typed; other columns pass through
// unread. `splitters` is `unknown` because a non-array value (legacy/bad
// data) must be left untouched rather than coerced.
export interface ClaimRenameExpenseRow {
  id: string | number;
  paid: string;
  splitters?: unknown;
  shares?: Record<string, number> | null;
}

// A patch to apply via `supabase.from('expenses').update(...).eq('id', id)`.
export interface ClaimRenamePatch {
  id: string | number;
  paid: string;
  splitters: unknown;
  shares: Record<string, number> | null | undefined;
}

// Compute the expense patches needed to rename `oldName` to `newName` across
// `rows`. Only rows that actually change are returned (exact string match on
// `paid` / `splitters` entries / `shares` keys; a row with no occurrence of
// `oldName` is omitted entirely). `shares` re-keying preserves both the
// values and the original key order. Returns `[]` when `oldName === newName`
// (nothing to rename) or when no row is affected.
export function computeClaimRenamePatches(
  rows: ClaimRenameExpenseRow[],
  oldName: string,
  newName: string,
): ClaimRenamePatch[] {
  if (oldName === newName) return [];
  const patches: ClaimRenamePatch[] = [];
  for (const e of rows) {
    const paidNew = e.paid === oldName ? newName : e.paid;
    const splittersNew = Array.isArray(e.splitters)
      ? e.splitters.map((s: unknown) => (s === oldName ? newName : s))
      : e.splitters;
    let sharesNew = e.shares;
    if (e.shares && Object.prototype.hasOwnProperty.call(e.shares, oldName)) {
      sharesNew = {};
      for (const k of Object.keys(e.shares)) {
        sharesNew[k === oldName ? newName : k] = e.shares[k];
      }
    }
    if (
      paidNew !== e.paid ||
      JSON.stringify(splittersNew) !== JSON.stringify(e.splitters) ||
      JSON.stringify(sharesNew) !== JSON.stringify(e.shares)
    ) {
      patches.push({ id: e.id, paid: paidNew, splitters: splittersNew, shares: sharesNew });
    }
  }
  return patches;
}

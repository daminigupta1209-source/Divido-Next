// Multi-group person invite links (see inviteLink.ts) need two more pieces once
// a link is opened: (A) a pure model of what each spot in the link currently
// means (joinable / already the opener's / taken by someone else / gone), so
// the landing screen can render without guessing, and (B) a callable claim
// routine that actually seats the opener into one spot. Both are ported,
// behaviour-preserving, from the inline `inviteMatch` branch in
// joinGroupFromQuery (src/App.tsx ~2719-2838) so a later step can switch
// App.tsx to call these instead of duplicating the logic per-spot.
//
// Pure module — no React, no Supabase globals, no localStorage, no navigation.
// The claim routine takes a Supabase-like client as an explicit argument.

import { Group } from './types';
import { InviteSpot } from './inviteLink';
import { uniqueProfileName } from './identity';
import { titleCaseName } from './utils';
import { computeClaimRenamePatches, ClaimRenameExpenseRow } from './claimRename';

// Shape of a row as returned by `supabase.from('groups').select('*')`. Only
// the fields the landing model / claim routine touch are typed.
export interface InviteGroupRow {
  id: string | number;
  name: string;
  currency?: string | null;
  emoji?: string | null;
  simplify_debts?: boolean | null;
  created_date?: string | null;
  created_at?: string | null;
  is_direct?: boolean | null;
}

// Shape of a row as returned by `supabase.from('group_members').select('*')`.
export interface InviteMemberRow {
  id: string | number;
  group_id: string | number;
  name: string;
  user_email?: string | null;
  invite_email?: string | null;
  is_pending?: boolean | null;
  is_removed?: boolean | null;
  member_key?: string | null;
  link_request_email?: string | null;
  person_id?: string | null;
}

const LEFT_SUFFIX_RE = /\s*\(Left\)\s*$/i;
const isLeftName = (name: string): boolean => LEFT_SUFFIX_RE.test(String(name));
const normEmail = (s: string | null | undefined): string => (s || '').trim().toLowerCase();

// ─────────────────────────────────────────────────────────────────────────
// A) Landing model: one entry per invite spot, in link order, deduped by
// group (first spot per group wins).
// ─────────────────────────────────────────────────────────────────────────

export type InviteEntryStatus = 'joinable' | 'alreadyMine' | 'takenByOther' | 'unavailable';

export interface InviteLandingEntry {
  groupId: string;
  spot: Required<InviteSpot>;
  groupName: string;
  emoji: string | undefined;
  // Members who are neither is_removed nor named "... (Left)".
  activeMemberCount: number;
  // The group_members row this spot's memberKey resolved to, when found.
  targetRow: InviteMemberRow | undefined;
  status: InviteEntryStatus;
}

const isActiveMemberRow = (m: InviteMemberRow): boolean => !m.is_removed && !isLeftName(m.name);

// Pure landing-model builder: given the parsed invite spots and the fetched
// `groups` / `group_members` rows for all groups those spots reference,
// compute what each spot currently means for `myEmail`. Never throws.
export const buildInviteLandingModel = (
  spots: Required<InviteSpot>[],
  groups: InviteGroupRow[],
  members: InviteMemberRow[],
  myEmail: string | null | undefined,
): InviteLandingEntry[] => {
  const myEmailNorm = normEmail(myEmail);
  const seenGroups = new Set<string>();
  const entries: InviteLandingEntry[] = [];

  for (const spot of spots) {
    if (seenGroups.has(spot.groupId)) continue;
    seenGroups.add(spot.groupId);

    const groupRow = groups.find((g) => String(g.id) === spot.groupId);
    if (!groupRow) {
      entries.push({
        groupId: spot.groupId,
        spot,
        groupName: '',
        emoji: undefined,
        activeMemberCount: 0,
        targetRow: undefined,
        status: 'unavailable',
      });
      continue;
    }

    const groupMembers = members.filter((m) => String(m.group_id) === spot.groupId);
    const activeMemberCount = groupMembers.filter(isActiveMemberRow).length;
    const targetRow = groupMembers.find((m) => m.member_key === spot.memberKey);

    // I'm already seated in this group via some OTHER row (e.g. I claimed a
    // different placeholder earlier) — nothing left to join here, regardless
    // of what this particular spot's row looks like.
    const alreadyActiveElsewhere =
      !!myEmailNorm && groupMembers.some((m) => isActiveMemberRow(m) && normEmail(m.user_email) === myEmailNorm);

    let status: InviteEntryStatus;
    if (alreadyActiveElsewhere) {
      status = 'alreadyMine';
    } else if (!targetRow || targetRow.is_removed || isLeftName(targetRow.name)) {
      status = 'unavailable';
    } else if (!targetRow.user_email) {
      status = 'joinable';
    } else if (normEmail(targetRow.user_email) === myEmailNorm) {
      status = 'alreadyMine';
    } else {
      status = 'takenByOther';
    }

    entries.push({
      groupId: spot.groupId,
      spot,
      groupName: groupRow.name || '',
      emoji: groupRow.emoji || undefined,
      activeMemberCount,
      targetRow,
      status,
    });
  }

  return entries;
};

// Default selection for a multi-spot landing screen: only the spots the
// opener can actually claim.
export const defaultSelectedGroupIds = (entries: InviteLandingEntry[]): string[] =>
  entries.filter((e) => e.status === 'joinable').map((e) => e.groupId);

// Entries worth showing on the landing screen at all (a gone/unavailable spot
// is silently skipped rather than rendered as an error row).
export const visibleEntryCount = (entries: InviteLandingEntry[]): number =>
  entries.filter((e) => e.status !== 'unavailable').length;

// Whether the link, as opened, lets this person actually join anything.
export const hasActionableEntry = (entries: InviteLandingEntry[]): boolean =>
  entries.some((e) => e.status === 'joinable');

// ─────────────────────────────────────────────────────────────────────────
// B) Claim routine — seats `myEmail` into one group_members row and, if the
// display name changed from the placeholder, rewrites this group's expenses
// so paid/splitters/shares keep pointing at the right person (balance-safe).
//
// RLS ORDERING CONTRACT (money-affecting — do not reorder): the row update
// that claims the placeholder MUST be committed, and confirmed via `.select()`
// to have actually affected a row, before the expense rename patches are
// written. See claimRename.ts for why.
// ─────────────────────────────────────────────────────────────────────────

// Minimal shape of the Supabase client this routine needs — just the handful
// of PostgREST query-builder methods actually called below. Loose (generic,
// not the full @supabase/supabase-js surface) so a small fake object can
// stand in for it in tests.
export interface InviteQueryListResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}

export interface InviteQuerySingleResult<Row> {
  data: Row | null;
  error: { message: string } | null;
}

export interface InviteQueryBuilder<Row> extends PromiseLike<InviteQueryListResult<Row>> {
  select: (columns?: string) => InviteQueryBuilder<Row>;
  eq: (column: string, value: unknown) => InviteQueryBuilder<Row>;
  in: (column: string, values: unknown[]) => InviteQueryBuilder<Row>;
  order: (column: string, options?: { ascending?: boolean }) => InviteQueryBuilder<Row>;
  update: (values: Record<string, unknown>) => InviteQueryBuilder<Row>;
  maybeSingle: () => PromiseLike<InviteQuerySingleResult<Row>>;
}

export interface SupabaseLike {
  from: <Row = unknown>(table: string) => InviteQueryBuilder<Row>;
}

export interface ClaimInviteSpotParams {
  groupRow: InviteGroupRow;
  // The row to claim. For the single-group auto-claim path this is
  // `inviteMatch`; for a multi-spot link it's the row an entry's memberKey
  // resolved to. Only `id` and `name` are required to start the claim — the
  // row is re-read fresh by id before anything is written.
  targetRow: Pick<InviteMemberRow, 'id' | 'name'>;
  // All member rows of this group (used for the taken-name check and to spot
  // the opener's own past "(Left)" row).
  existingMembers: InviteMemberRow[];
  myEmail: string;
  // Session profile name, already extracted via
  // `titleCaseName(session.user.user_metadata.full_name || ...name || '')`.
  profileName: string;
  // `localStorage.divido_username`, passed in because this module never
  // touches storage. Used only when `profileName` is empty, exactly like the
  // original inline logic.
  fallbackUsername?: string;
}

export type ClaimInviteSpotResult =
  | { status: 'joined'; claimedName: string; group: Group }
  | { status: 'alreadyMine' }
  | { status: 'takenByOther' }
  | { status: 'error'; message: string };

// Legacy trailing dot/space-insensitive email compare, used ONLY for the
// "is this row my own past (Left) spot" check and the taken-name set, to
// reproduce the original inline behaviour exactly.
const normEmailLegacy = (s: string | null | undefined): string => (s || '').trim().toLowerCase().replace(/[\s.]+$/, '');

// The original inline code (App.tsx ~2719-2838) used three slightly different
// "(Left)" patterns depending on what it was doing. Reproduced verbatim here
// rather than unified, so this claim routine matches it byte-for-byte.
const PLACEHOLDER_LEFT_STRIP_RE = /\s*\(Left\)$/i; // strip suffix off a display name
const OWN_LEFT_TEST_RE = /\(Left\)\s*$/i; // "is this row my own past spot" test

const UNUSABLE_FALLBACK_NAMES = ['You', 'Guest', 'undefined', ''];

export async function claimInviteSpot(supabase: SupabaseLike, params: ClaimInviteSpotParams): Promise<ClaimInviteSpotResult> {
  try {
    const { groupRow, targetRow, existingMembers, myEmail, fallbackUsername } = params;
    const myEmailNorm = normEmail(myEmail);

    const { data: freshRow, error: readErr } = await supabase
      .from<InviteMemberRow>('group_members')
      .select('*')
      .eq('id', targetRow.id)
      .maybeSingle();
    if (readErr) return { status: 'error', message: readErr.message };
    if (!freshRow) return { status: 'error', message: 'Invite spot no longer exists.' };

    const freshEmailNorm = normEmail(freshRow.user_email);
    if (freshEmailNorm) {
      return freshEmailNorm === myEmailNorm ? { status: 'alreadyMine' } : { status: 'takenByOther' };
    }

    const placeholderName = String(freshRow.name).replace(PLACEHOLDER_LEFT_STRIP_RE, '');

    let profileName = params.profileName;
    if (!profileName) {
      const fallback = (fallbackUsername || '').trim();
      if (fallback && !UNUSABLE_FALLBACK_NAMES.includes(fallback)) profileName = fallback;
    }

    // The opener's OWN earlier "(Left)" spot isn't a name clash — it's them.
    const myEmailLegacyNorm = normEmailLegacy(myEmail);
    const isOwnLeft = (m: InviteMemberRow): boolean =>
      OWN_LEFT_TEST_RE.test(String(m.name)) &&
      (normEmailLegacy(m.user_email) === myEmailLegacyNorm || normEmailLegacy(m.invite_email) === myEmailLegacyNorm);
    const takenNames = new Set(
      existingMembers
        .filter((m) => m.id !== freshRow.id && !isOwnLeft(m))
        .map((m) => String(m.name).replace(PLACEHOLDER_LEFT_STRIP_RE, '').trim().toLowerCase()),
    );
    const ownLeftIds = existingMembers.filter((m) => m.id !== freshRow.id && isOwnLeft(m)).map((m) => m.id);

    // For a shared 2-person "direct" thread, KEEP the inviter's chosen name
    // (renaming there desyncs expense splitter strings → wrong balances).
    const claimedName = groupRow.is_direct
      ? placeholderName
      : profileName
        ? uniqueProfileName(profileName, myEmail, takenNames)
        : placeholderName;

    if (ownLeftIds.length > 0) {
      const { error: hideErr } = await supabase.from('group_members').update({ is_removed: true }).in('id', ownLeftIds);
      if (hideErr) console.error('Hiding own past spot failed:', hideErr);
    }

    // `.select()` turns the PATCH response into the affected rows, so a race
    // where RLS silently blocked the update (someone else claimed it a moment
    // ago) shows up as zero rows instead of a false success.
    const { data: updatedRows, error: updateErr } = await supabase
      .from<InviteMemberRow>('group_members')
      .update({ name: claimedName, user_email: myEmail, is_pending: false })
      .eq('id', freshRow.id)
      .select();
    if (updateErr) return { status: 'error', message: updateErr.message };
    if (!updatedRows || updatedRows.length === 0) return { status: 'takenByOther' };

    if (claimedName !== placeholderName) {
      try {
        const { data: exps } = await supabase.from<ClaimRenameExpenseRow>('expenses').select('*').eq('group_id', groupRow.id);
        const patches = computeClaimRenamePatches(exps || [], placeholderName, claimedName);
        for (const patch of patches) {
          const { error } = await supabase
            .from('expenses')
            .update({ paid: patch.paid, splitters: patch.splitters, shares: patch.shares })
            .eq('id', patch.id);
          if (error) console.error('claim rename rewrite failed:', error);
        }
      } catch (rwErr) {
        console.error('claim rename rewrite failed:', rwErr);
      }
    }

    // Put the group into local state WITH its roster before the caller
    // navigates, so the detail screen renders immediately instead of a blank
    // / stale group until the background cloud-load catches up.
    let freshMembers: string[] = [];
    let freshPending: string[] = [];
    const memberIdentities: Record<string, string> = {};
    try {
      const { data: gm } = await supabase
        .from<InviteMemberRow>('group_members')
        .select('*')
        .eq('group_id', groupRow.id)
        .order('id', { ascending: true });
      if (gm) {
        const activeMems = gm.filter((m) => !m.link_request_email || !m.is_pending || String(m.name).endsWith(' (Left)'));
        freshMembers = Array.from(new Set(activeMems.map((m) => titleCaseName(m.name))));
        freshPending = Array.from(
          new Set(
            activeMems
              .filter((m) => m.is_pending && !m.user_email && !String(m.name).endsWith(' (Left)'))
              .map((m) => titleCaseName(m.name)),
          ),
        );
        activeMems.forEach((m) => {
          const dn = titleCaseName(m.name);
          const identity =
            (m.user_email ? m.user_email.toLowerCase() : '') ||
            (m.invite_email ? m.invite_email.toLowerCase() : '') ||
            m.person_id ||
            dn.replace(PLACEHOLDER_LEFT_STRIP_RE, '');
          if (!memberIdentities[dn]) memberIdentities[dn] = identity;
        });
      }
    } catch {
      /* background cloud-load will fill it in, same fallback as the original */
    }

    const group: Group = {
      id: groupRow.id,
      name: groupRow.name,
      currency: groupRow.currency || '₹',
      emoji: groupRow.emoji || undefined,
      simplifyDebts: groupRow.simplify_debts || false,
      createdDate: groupRow.created_date || (groupRow.created_at ? String(groupRow.created_at).split('T')[0] : undefined),
      members: freshMembers.length ? freshMembers : [claimedName],
      pendingMembers: freshPending,
      memberIdentities,
    };

    return { status: 'joined', claimedName, group };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

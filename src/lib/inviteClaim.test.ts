import { describe, it, expect } from 'vitest';
import {
  buildInviteLandingModel,
  defaultSelectedGroupIds,
  visibleEntryCount,
  hasActionableEntry,
  claimInviteSpot,
  InviteGroupRow,
  InviteMemberRow,
  SupabaseLike,
} from './inviteClaim';
import { InviteSpot } from './inviteLink';

const spot = (groupId: string, memberKey: string): Required<InviteSpot> => ({ groupId, memberKey });

const group = (over: Partial<InviteGroupRow> & { id: string }): InviteGroupRow => ({
  name: 'Group',
  ...over,
});

const member = (over: Partial<InviteMemberRow> & { id: string; group_id: string }): InviteMemberRow => ({
  name: 'Member',
  ...over,
});

describe('buildInviteLandingModel', () => {
  it('marks a spot joinable when the row exists, is active, and has no user_email', () => {
    const spots = [spot('g1', 'mk1')];
    const groups = [group({ id: 'g1', name: 'Goa Trip', emoji: '🏖️' })];
    const members = [member({ id: 'm1', group_id: 'g1', member_key: 'mk1', name: 'Placeholder' })];
    const entries = buildInviteLandingModel(spots, groups, members, 'me@example.com');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      groupId: 'g1',
      groupName: 'Goa Trip',
      emoji: '🏖️',
      activeMemberCount: 1,
      status: 'joinable',
    });
  });

  it('marks unavailable when the group row is missing', () => {
    const entries = buildInviteLandingModel([spot('gX', 'mk1')], [], [], 'me@example.com');
    expect(entries[0].status).toBe('unavailable');
    expect(entries[0].groupName).toBe('');
    expect(entries[0].activeMemberCount).toBe(0);
  });

  it('marks unavailable when no row matches the memberKey', () => {
    const groups = [group({ id: 'g1' })];
    const members = [member({ id: 'm1', group_id: 'g1', member_key: 'other-key' })];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, 'me@example.com');
    expect(entries[0].status).toBe('unavailable');
    expect(entries[0].targetRow).toBeUndefined();
  });

  it('marks unavailable when the matched row is is_removed', () => {
    const groups = [group({ id: 'g1' })];
    const members = [member({ id: 'm1', group_id: 'g1', member_key: 'mk1', is_removed: true })];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, 'me@example.com');
    expect(entries[0].status).toBe('unavailable');
  });

  it('marks unavailable when the matched row name ends with "(Left)"', () => {
    const groups = [group({ id: 'g1' })];
    const members = [member({ id: 'm1', group_id: 'g1', member_key: 'mk1', name: 'Rahul (Left)' })];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, 'me@example.com');
    expect(entries[0].status).toBe('unavailable');
  });

  it('marks alreadyMine when the row user_email matches mine (case-insensitive, trimmed)', () => {
    const groups = [group({ id: 'g1' })];
    const members = [member({ id: 'm1', group_id: 'g1', member_key: 'mk1', user_email: '  ME@Example.com  ' })];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, 'me@example.com');
    expect(entries[0].status).toBe('alreadyMine');
  });

  it('marks takenByOther when the row user_email belongs to someone else', () => {
    const groups = [group({ id: 'g1' })];
    const members = [member({ id: 'm1', group_id: 'g1', member_key: 'mk1', user_email: 'other@example.com' })];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, 'me@example.com');
    expect(entries[0].status).toBe('takenByOther');
  });

  it('marks alreadyMine when I am already an active member of the group via another row', () => {
    const groups = [group({ id: 'g1' })];
    const members = [
      member({ id: 'm1', group_id: 'g1', member_key: 'mk1', name: 'Placeholder' }), // the spot's row, untouched
      member({ id: 'm2', group_id: 'g1', user_email: 'me@example.com', name: 'Me Already' }),
    ];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, 'me@example.com');
    expect(entries[0].status).toBe('alreadyMine');
  });

  it('does not treat a removed or left other-row as making me an active member', () => {
    const groups = [group({ id: 'g1' })];
    const members = [
      member({ id: 'm1', group_id: 'g1', member_key: 'mk1', name: 'Placeholder' }),
      member({ id: 'm2', group_id: 'g1', user_email: 'me@example.com', name: 'Me (Left)' }),
    ];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, 'me@example.com');
    expect(entries[0].status).toBe('joinable');
  });

  it('dedupes by group, keeping the first spot per group', () => {
    const groups = [group({ id: 'g1' })];
    const members = [
      member({ id: 'm1', group_id: 'g1', member_key: 'mk1', name: 'First' }),
      member({ id: 'm2', group_id: 'g1', member_key: 'mk2', name: 'Second' }),
    ];
    const entries = buildInviteLandingModel([spot('g1', 'mk1'), spot('g1', 'mk2')], groups, members, 'me@example.com');
    expect(entries).toHaveLength(1);
    expect(entries[0].targetRow?.name).toBe('First');
  });

  it('counts activeMemberCount excluding is_removed and "(Left)" rows', () => {
    const groups = [group({ id: 'g1' })];
    const members = [
      member({ id: 'm1', group_id: 'g1', member_key: 'mk1', name: 'A' }),
      member({ id: 'm2', group_id: 'g1', name: 'B (Left)' }),
      member({ id: 'm3', group_id: 'g1', name: 'C', is_removed: true }),
      member({ id: 'm4', group_id: 'g1', name: 'D' }),
    ];
    const entries = buildInviteLandingModel([spot('g1', 'mk1')], groups, members, null);
    expect(entries[0].activeMemberCount).toBe(2);
  });

  it('preserves link order across multiple groups', () => {
    const groups = [group({ id: 'g1', name: 'A' }), group({ id: 'g2', name: 'B' })];
    const members = [
      member({ id: 'm1', group_id: 'g1', member_key: 'mk1' }),
      member({ id: 'm2', group_id: 'g2', member_key: 'mk2' }),
    ];
    const entries = buildInviteLandingModel([spot('g2', 'mk2'), spot('g1', 'mk1')], groups, members, null);
    expect(entries.map((e) => e.groupId)).toEqual(['g2', 'g1']);
  });
});

describe('defaultSelectedGroupIds / visibleEntryCount / hasActionableEntry', () => {
  const groups = [group({ id: 'g1' }), group({ id: 'g2' }), group({ id: 'g3' })];
  const members = [
    member({ id: 'm1', group_id: 'g1', member_key: 'mk1' }), // joinable
    member({ id: 'm2', group_id: 'g2', member_key: 'mk2', user_email: 'other@example.com' }), // takenByOther
    member({ id: 'm3', group_id: 'g3', member_key: 'mk3', is_removed: true }), // unavailable
  ];
  const entries = buildInviteLandingModel(
    [spot('g1', 'mk1'), spot('g2', 'mk2'), spot('g3', 'mk3')],
    groups,
    members,
    'me@example.com',
  );

  it('selects only joinable entries by default', () => {
    expect(defaultSelectedGroupIds(entries)).toEqual(['g1']);
  });

  it('counts visible (non-unavailable) entries', () => {
    expect(visibleEntryCount(entries)).toBe(2);
  });

  it('reports actionable only when a joinable entry exists', () => {
    expect(hasActionableEntry(entries)).toBe(true);
    expect(hasActionableEntry(entries.filter((e) => e.status !== 'joinable'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// claimInviteSpot — exercised with a small fake Supabase client.
// ─────────────────────────────────────────────────────────────────────────

type FakeRow = Record<string, unknown>;

interface FakeBuilder {
  _filters: Array<(row: FakeRow) => boolean>;
  _mode: 'select' | 'update';
  _patch: Record<string, unknown> | undefined;
  _wantSelect: boolean;
  select: (columns?: string) => FakeBuilder;
  eq: (col: string, val: unknown) => FakeBuilder;
  in: (col: string, vals: unknown[]) => FakeBuilder;
  order: (column?: string, options?: { ascending?: boolean }) => FakeBuilder;
  update: (patch: Record<string, unknown>) => FakeBuilder;
  then: (resolve: (v: { data: FakeRow[] | null; error: null }) => void) => void;
  maybeSingle: () => Promise<{ data: FakeRow | null; error: null }>;
}

// Builds a fake `from(table)` chain backed by an in-memory `group_members`
// and `expenses` table. Supports exactly the methods claimInviteSpot calls:
// select/eq/in/order/maybeSingle/update/insert-free.
function makeFakeSupabase(
  initial: { group_members: InviteMemberRow[]; expenses?: Record<string, unknown>[] },
  options: { blockClaimUpdate?: boolean } = {},
): {
  supabase: SupabaseLike;
  state: { group_members: FakeRow[]; expenses: FakeRow[] };
} {
  const state = {
    group_members: initial.group_members.map((m) => ({ ...m })) as FakeRow[],
    expenses: initial.expenses ? [...initial.expenses] : [],
  };

  const from = (table: 'group_members' | 'expenses'): FakeBuilder => {
    const rows = () => (table === 'group_members' ? state.group_members : state.expenses);

    const builder: FakeBuilder = {
      _filters: [],
      _mode: 'select',
      _patch: undefined,
      _wantSelect: false,

      select(this: FakeBuilder) {
        if (this._mode === 'update') this._wantSelect = true;
        return this;
      },
      eq(this: FakeBuilder, col, val) {
        this._filters.push((row) => row[col] === val);
        return this;
      },
      in(this: FakeBuilder, col, vals) {
        this._filters.push((row) => vals.includes(row[col]));
        return this;
      },
      order(this: FakeBuilder) {
        return this;
      },
      update(this: FakeBuilder, patch) {
        this._mode = 'update';
        this._patch = patch;
        return this;
      },
      // update(...).select() — resolves the promise itself since nothing
      // chains after it in this fake.
      then(this: FakeBuilder, resolve) {
        // Simulates RLS silently blocking the claim's row update: the row
        // stays as-is and PostgREST's `return=representation` reports zero
        // affected rows.
        if (table === 'group_members' && this._mode === 'update' && this._wantSelect && options.blockClaimUpdate) {
          resolve({ data: [], error: null });
          return;
        }
        const matched = rows().filter((r) => this._filters.every((f) => f(r)));
        if (this._mode === 'update' && this._patch) {
          matched.forEach((r) => Object.assign(r, this._patch));
        }
        resolve({ data: this._wantSelect || this._mode === 'select' ? matched : null, error: null });
      },
      async maybeSingle(this: FakeBuilder) {
        const matched = rows().filter((r) => this._filters.every((f) => f(r)));
        return { data: matched[0] ?? null, error: null };
      },
    };
    return builder;
  };

  return { supabase: { from: from as unknown as SupabaseLike['from'] }, state };
}

const baseGroupRow: InviteGroupRow = { id: 'g1', name: 'Goa Trip', currency: '₹' };

describe('claimInviteSpot', () => {
  it('returns takenByOther when the fresh row is already claimed by someone else (pre-check)', async () => {
    const { supabase } = makeFakeSupabase({
      group_members: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder', user_email: 'other@example.com' })],
    });
    const result = await claimInviteSpot(supabase, {
      groupRow: baseGroupRow,
      targetRow: { id: 'm1', name: 'Placeholder' },
      existingMembers: [],
      myEmail: 'me@example.com',
      profileName: 'Me',
    });
    expect(result).toEqual({ status: 'takenByOther' });
  });

  it('returns alreadyMine without writing when the fresh row is already mine', async () => {
    const { supabase, state } = makeFakeSupabase({
      group_members: [member({ id: 'm1', group_id: 'g1', name: 'Me', user_email: 'me@example.com' })],
    });
    const before = JSON.stringify(state.group_members);
    const result = await claimInviteSpot(supabase, {
      groupRow: baseGroupRow,
      targetRow: { id: 'm1', name: 'Me' },
      existingMembers: [],
      myEmail: 'ME@example.com',
      profileName: 'Me',
    });
    expect(result).toEqual({ status: 'alreadyMine' });
    expect(JSON.stringify(state.group_members)).toBe(before);
  });

  it('returns an error when the target row no longer exists on re-read', async () => {
    const { supabase } = makeFakeSupabase({ group_members: [] });
    const result = await claimInviteSpot(supabase, {
      groupRow: baseGroupRow,
      targetRow: { id: 'missing', name: 'Placeholder' },
      existingMembers: [],
      myEmail: 'me@example.com',
      profileName: 'Me',
    });
    expect(result.status).toBe('error');
  });

  it('treats a zero-row claim update (RLS silently blocked a just-claimed row) as takenByOther', async () => {
    const { supabase, state } = makeFakeSupabase(
      { group_members: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder' })] },
      { blockClaimUpdate: true },
    );
    const result = await claimInviteSpot(supabase, {
      groupRow: baseGroupRow,
      targetRow: { id: 'm1', name: 'Placeholder' },
      existingMembers: [],
      myEmail: 'me@example.com',
      profileName: 'Me',
    });
    expect(result).toEqual({ status: 'takenByOther' });
    // The blocked update must not have been applied locally either.
    expect(state.group_members[0].user_email).toBeFalsy();
  });

  it('claims an open spot, applies rename patches, and returns the joined group', async () => {
    const { supabase, state } = makeFakeSupabase({
      group_members: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder' })],
      expenses: [{ id: 'e1', group_id: 'g1', paid: 'Placeholder', splitters: ['Placeholder', 'Other'], shares: null }],
    });
    const result = await claimInviteSpot(supabase, {
      groupRow: baseGroupRow,
      targetRow: { id: 'm1', name: 'Placeholder' },
      existingMembers: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder' })],
      myEmail: 'me@example.com',
      profileName: 'Rahul Kumar',
    });
    expect(result.status).toBe('joined');
    if (result.status !== 'joined') throw new Error('unreachable');
    expect(result.claimedName).toBe('Rahul Kumar');
    expect(state.group_members[0]).toMatchObject({ name: 'Rahul Kumar', user_email: 'me@example.com', is_pending: false });
    expect(state.expenses[0]).toMatchObject({ paid: 'Rahul Kumar', splitters: ['Rahul Kumar', 'Other'] });
    expect(result.group).toMatchObject({ id: 'g1', name: 'Goa Trip', members: ['Rahul Kumar'] });
  });

  it('keeps the placeholder name for a direct thread even with a profile name available', async () => {
    const { supabase, state } = makeFakeSupabase({
      group_members: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder' })],
    });
    const directGroupRow: InviteGroupRow = { id: 'g1', name: 'Direct Thread', is_direct: true };
    const result = await claimInviteSpot(supabase, {
      groupRow: directGroupRow,
      targetRow: { id: 'm1', name: 'Placeholder' },
      existingMembers: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder' })],
      myEmail: 'me@example.com',
      profileName: 'Rahul Kumar',
    });
    expect(result.status).toBe('joined');
    if (result.status !== 'joined') throw new Error('unreachable');
    expect(result.claimedName).toBe('Placeholder');
    expect(state.group_members[0].name).toBe('Placeholder');
  });

  it('falls back to fallbackUsername when profileName is empty, unless it is a placeholder like "Guest"', async () => {
    const { supabase: s1 } = makeFakeSupabase({ group_members: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder' })] });
    const r1 = await claimInviteSpot(s1, {
      groupRow: baseGroupRow,
      targetRow: { id: 'm1', name: 'Placeholder' },
      existingMembers: [],
      myEmail: 'me@example.com',
      profileName: '',
      fallbackUsername: 'Guest',
    });
    expect(r1.status).toBe('joined');
    if (r1.status !== 'joined') throw new Error('unreachable');
    expect(r1.claimedName).toBe('Placeholder');

    const { supabase: s2 } = makeFakeSupabase({ group_members: [member({ id: 'm1', group_id: 'g1', name: 'Placeholder' })] });
    const r2 = await claimInviteSpot(s2, {
      groupRow: baseGroupRow,
      targetRow: { id: 'm1', name: 'Placeholder' },
      existingMembers: [],
      myEmail: 'me@example.com',
      profileName: '',
      fallbackUsername: 'Priya',
    });
    expect(r2.status).toBe('joined');
    if (r2.status !== 'joined') throw new Error('unreachable');
    expect(r2.claimedName).toBe('Priya');
  });
});

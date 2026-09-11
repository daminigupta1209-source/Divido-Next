import { describe, it, expect } from 'vitest';
import { getPersonKey, resolveSelfKey, buildNameEmailResolver, upiFor, cleanMemberName, balancesByIdentity, buildKeyToName, buildPeopleSuggestions, isValidEmail, canonicalRosterName, findDuplicateGroups } from './identity';
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

describe('isValidEmail', () => {
  it('accepts a normal address and rejects obvious junk', () => {
    expect(isValidEmail('ravi@gmail.com')).toBe(true);
    expect(isValidEmail('  ravi@gmail.com  ')).toBe(true);
    expect(isValidEmail('hello')).toBe(false);
    expect(isValidEmail('a@@b')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);      // no dot/TLD
    expect(isValidEmail('a b@c.com')).toBe(false); // space
    expect(isValidEmail('')).toBe(false);
  });
});

describe('buildPeopleSuggestions', () => {
  const mk = (id: string, name: string, members: string[], mi: Record<string, string>): Group =>
    ({ id, name, currency: '₹', members, memberIdentities: mi } as unknown as Group);

  it('carries a name-only person\'s hidden id so it can be reused across groups', () => {
    // Ravi is name-only in "Goa" with a stable person_id. Adding a NEW group,
    // his suggestion must carry that id (not an email, and not blank) so the
    // picker re-links to the same person instead of minting a duplicate.
    const groups = [mk('goa', 'Goa', ['Chirag', 'Ravi'], { Chirag: 'chirag@x.com', Ravi: 'pid-ravi' })];
    const out = buildPeopleSuggestions(groups, 'new', [], 'Chirag');
    const ravi = out.find((s) => s.name === 'Ravi');
    expect(ravi).toBeTruthy();
    expect(ravi!.email).toBe('');
    expect(ravi!.identity).toBe('pid-ravi');
  });

  it('uses the email as identity for an email-bearing person', () => {
    const groups = [mk('goa', 'Goa', ['Chirag', 'Meera'], { Chirag: 'chirag@x.com', Meera: 'meera@x.com' })];
    const out = buildPeopleSuggestions(groups, 'new', [], 'Chirag');
    const meera = out.find((s) => s.name === 'Meera');
    expect(meera!.email).toBe('meera@x.com');
    expect(meera!.identity).toBe('meera@x.com');
  });

  it('excludes me and people already in the current group', () => {
    const groups = [
      mk('goa', 'Goa', ['Chirag', 'Ravi'], { Chirag: 'chirag@x.com', Ravi: 'pid-ravi' }),
      mk('trip', 'Trip', ['Chirag', 'Zoya'], { Chirag: 'chirag@x.com', Zoya: 'pid-zoya' }),
    ];
    // Current group already has Ravi → he shouldn't be suggested again; me is excluded.
    const out = buildPeopleSuggestions(groups, 'new', ['Ravi'], 'Chirag');
    const names = out.map((s) => s.name);
    expect(names).toContain('Zoya');
    expect(names).not.toContain('Ravi');
    expect(names).not.toContain('Chirag');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cross-screen consistency guard.
//
// The 2026-09-01 money bug: the global settle sheet showed "you collect
// ₹6523" while the friend card said "you pay ₹3517" for the SAME person —
// opposite direction, wrong total. Root cause: the settle sheet had its own
// hand-rolled pairwise math and decided direction by comparing a per-group
// transaction NAME to the flat global `me` (`paidBy === me`), which flips once
// a user's per-group name differs from their global name.
//
// These tests lock in the invariant: every screen derives its net from the ONE
// canonical engine (`balancesByIdentity`) and keys people by identity, so the
// friend-card net, the settle-sheet net, and the group balance can never
// diverge for the same expenses — including when `me`'s per-group name is not
// the display name. If someone reintroduces a private pairwise copy or a
// name-based direction check, these fail.
// ─────────────────────────────────────────────────────────────────────────
describe('cross-screen balance consistency', () => {
  type Money = Record<string, number>;

  // How every balance screen nets a person: sum currencies I collect (I am the
  // creditor `to`) as positive, amounts I pay (I am the debtor `from`) as
  // negative. `meKey`/`friendKey` are IDENTITY keys, never raw names — this is
  // the direction rule the settle sheet violated.
  const netForFriend = (
    txns: { from: string; to: string; balances: Money }[],
    keyOf: (name: string) => string,
    meKey: string,
    friendKey: string,
  ): Money => {
    const acc: Money = {};
    for (const t of txns) {
      const fromK = keyOf(t.from);
      const toK = keyOf(t.to);
      const sign = toK === meKey && fromK === friendKey ? +1
        : fromK === meKey && toK === friendKey ? -1
        : 0;
      if (!sign) continue;
      for (const [c, v] of Object.entries(t.balances)) acc[c] = (acc[c] || 0) + sign * v;
    }
    return acc;
  };

  it('friend-card net, settle-sheet net and group balance agree even when my per-group name differs', () => {
    // `me` signed in as Chirag (email identity) but the expenses were entered
    // before the claim under the per-group name "Bhaiya". A name-based direction
    // check (`paidBy === "Chirag"`) would never match "Bhaiya" and flip signs.
    const g = mkGroup(
      { Bhaiya: 'chirag@x.com', Ram: 'pid-ram', Sita: 'pid-sita' },
      ['Bhaiya', 'Ram', 'Sita'],
    );
    const keyOf = (name: string) => getPersonKey(g, name);
    const meKey = 'chirag@x.com';

    const exps = [
      // I (as "Bhaiya") paid 300 split three ways → Ram & Sita each owe me 100.
      mkExp({ id: 'a', paid: 'Bhaiya', amt: 300, splitters: ['Bhaiya', 'Ram', 'Sita'], mode: 'Equally' }),
      // Ram paid 60 split three ways → I owe Ram 20.
      mkExp({ id: 'b', paid: 'Ram', amt: 60, splitters: ['Bhaiya', 'Ram', 'Sita'], mode: 'Equally' }),
    ];

    // The single source of truth. Both the friend card and the settle sheet
    // read from this same call in the app. Raw (unsimplified) so the pairwise
    // amounts are directly checkable; the direction rule is what matters here.
    const txns = balancesByIdentity(g, exps, false);

    // Friend-card view: net toward Ram, net toward Sita.
    const cardRam = netForFriend(txns, keyOf, meKey, 'pid-ram');
    const cardSita = netForFriend(txns, keyOf, meKey, 'pid-sita');

    // I collect 100 from Ram minus the 20 I owe → +80. I collect 100 from Sita.
    expect(cardRam['₹']).toBeCloseTo(80);
    expect(cardSita['₹']).toBeCloseTo(100);

    // Settle-sheet view: derived from the SAME txns, must equal the card.
    const settleRam = netForFriend(txns, keyOf, meKey, 'pid-ram');
    const settleSita = netForFriend(txns, keyOf, meKey, 'pid-sita');
    expect(settleRam).toEqual(cardRam);
    expect(settleSita).toEqual(cardSita);

    // Group-balance view: my overall net = sum of all my pairwise nets, and must
    // equal collecting 180 total from the group.
    const myGroupNet = [...Object.values(cardRam), ...Object.values(cardSita)]
      .reduce((s, v) => s + v, 0);
    expect(myGroupNet).toBeCloseTo(180);

    // And direction is a genuine POSITIVE (collect), not flipped to a pay.
    expect(myGroupNet).toBeGreaterThan(0);
  });

  it('raw and simplified engines produce the same per-person NET for everyone', () => {
    // Simplification only reroutes WHO pays WHOM; each person's overall net must
    // be identical. If the settle sheet (simplified) and a friend card (also
    // simplified) ever disagree, it is because one stopped using this engine.
    const g = mkGroup(
      { Chirag: 'chirag@x.com', Ram: 'pid-ram', Sita: 'pid-sita' },
      ['Chirag', 'Ram', 'Sita'],
    );
    const exps = [
      mkExp({ id: 'a', paid: 'Chirag', amt: 90, splitters: ['Chirag', 'Ram', 'Sita'], mode: 'Equally' }),
      mkExp({ id: 'b', paid: 'Ram', amt: 30, splitters: ['Chirag', 'Ram'], mode: 'Equally' }),
      mkExp({ id: 'c', paid: 'Sita', amt: 60, splitters: ['Ram', 'Sita'], mode: 'Equally' }),
    ];

    const netByKey = (txns: { from: string; to: string; balances: Money }[]): Record<string, Money> => {
      const out: Record<string, Money> = {};
      const bump = (k: string, c: string, v: number) => {
        (out[k] = out[k] || {})[c] = (out[k][c] || 0) + v;
      };
      for (const t of txns) {
        for (const [c, v] of Object.entries(t.balances)) {
          bump(getPersonKey(g, t.to), c, v);    // creditor collects
          bump(getPersonKey(g, t.from), c, -v); // debtor pays
        }
      }
      // Drop rounding-only zero entries so the two shapes compare cleanly, and
      // drop a person entirely once they net to nothing — simplification may
      // omit a zero-net person from the txn list while the raw engine keeps a
      // zeroed entry; both mean "settled", so normalize to the same shape.
      for (const k of Object.keys(out)) {
        for (const c of Object.keys(out[k])) {
          out[k][c] = Math.round(out[k][c] * 100) / 100;
          if (out[k][c] === 0) delete out[k][c];
        }
        if (Object.keys(out[k]).length === 0) delete out[k];
      }
      return out;
    };

    const rawNet = netByKey(balancesByIdentity(g, exps, false));
    const simplifiedNet = netByKey(balancesByIdentity(g, exps, true));
    expect(simplifiedNet).toEqual(rawNet);
  });
});

describe('canonicalRosterName', () => {
  const roster = ['Damini Gupta', 'Vandana Investment'];

  it('snaps a flat first name to the full roster name', () => {
    expect(canonicalRosterName('Damini', roster)).toBe('Damini Gupta');
  });

  it('keeps an exact match (case-insensitive)', () => {
    expect(canonicalRosterName('damini gupta', roster)).toBe('Damini Gupta');
  });

  it('strips a (Left) suffix when matching', () => {
    expect(canonicalRosterName('Damini', ['Damini Gupta (Left)', 'Vandana Investment'])).toBe('Damini Gupta');
  });

  it('leaves an ambiguous first name untouched', () => {
    expect(canonicalRosterName('Ram', ['Ram Kumar', 'Ram Singh'])).toBe('Ram');
  });

  it('leaves an unknown name untouched', () => {
    expect(canonicalRosterName('Zoya', roster)).toBe('Zoya');
  });

  it('returns the name as-is with no roster', () => {
    expect(canonicalRosterName('Damini', [])).toBe('Damini');
  });
});

describe('findDuplicateGroups', () => {
  const g = (id: string, name: string, members: string[], extra: any = {}): Group =>
    ({ id, name, currency: '₹', members, memberIdentities: {}, ...extra } as unknown as Group);

  it('flags same-name groups with the same member set', () => {
    const dups = findDuplicateGroups([
      g('a', 'Trip', ['Chirag', 'Ravi']),
      g('b', 'Trip', ['Ravi', 'Chirag']), // same members, different order
    ]);
    expect(dups.length).toBe(1);
    expect(dups[0].groups.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('does NOT flag two same-name groups with different members', () => {
    const dups = findDuplicateGroups([
      g('a', 'Trip', ['Chirag', 'Ravi']),
      g('b', 'Trip', ['Chirag', 'Meera']),
    ]);
    expect(dups.length).toBe(0);
  });

  it('ignores direct threads and STANDALONE', () => {
    const dups = findDuplicateGroups([
      g('a', 'X & Y', ['X', 'Y'], { isDirect: true }),
      g('b', 'X & Y', ['X', 'Y'], { isDirect: true }),
      g('STANDALONE', 'Non-Group', []),
    ]);
    expect(dups.length).toBe(0);
  });

  it('ignores (Left) suffixes when comparing members', () => {
    const dups = findDuplicateGroups([
      g('a', 'Goa', ['Chirag', 'Ravi']),
      g('b', 'Goa', ['Chirag', 'Ravi (Left)']),
    ]);
    expect(dups.length).toBe(1);
  });
});

// Regression suite for the 2026-09-10 "people vanished from All balances" bug.
// The user is enrolled under a full name ("Damini Gupta") in some groups while
// the app knows them only by their first name ("Damini"); if the wrong spelling
// is used the whole group's balances were silently dropped. resolveSelfKey must
// identify the user robustly (email first, then name variants).
describe('resolveSelfKey (self identity within a group)', () => {
  it('matches by email even when the display name differs (the core bug)', () => {
    const g = mkGroup({ 'Damini Gupta': 'damini@x.com', Abhishek: 'abhi-pid' });
    expect(
      resolveSelfKey(g, { email: 'damini@x.com', firstName: 'Damini', fullName: 'Damini Gupta' })
    ).toBe('damini@x.com');
  });

  it('matches by email case-insensitively', () => {
    const g = mkGroup({ 'Damini Gupta': 'damini@x.com' });
    expect(resolveSelfKey(g, { email: 'DAMINI@X.com', firstName: 'Damini' })).toBe('damini@x.com');
  });

  it('falls back to the FULL name when no email is stored locally', () => {
    const g = mkGroup({ 'Damini Gupta': 'damini@x.com', Abhishek: 'abhi-pid' });
    expect(resolveSelfKey(g, { email: '', firstName: 'Damini', fullName: 'Damini Gupta' })).toBe('damini@x.com');
  });

  it('falls back to the first name for a name-only member (no email)', () => {
    const g = mkGroup({ Damini: 'pid-damini', Abhishek: 'abhi-pid' });
    expect(resolveSelfKey(g, { email: '', firstName: 'Damini', fullName: 'Damini Gupta' })).toBe('pid-damini');
  });

  it('prefers the full name over a stale/incorrect per-group claim', () => {
    // claim points at a DIFFERENT person; full name is the real one → full name wins
    const g = mkGroup({ 'Damini Gupta': 'me@x.com', 'Damini Investment': 'inv@x.com' });
    expect(
      resolveSelfKey(g, { email: '', firstName: 'Damini', fullName: 'Damini Gupta', claim: 'Damini Investment' })
    ).toBe('me@x.com');
  });

  it('does not misidentify the user when nothing matches (graceful fallback)', () => {
    const g = mkGroup({ Someone: 'pid-x' });
    // returns the raw first name (old behaviour) rather than someone else's key
    expect(resolveSelfKey(g, { email: '', firstName: 'Damini' })).toBe('Damini');
  });

  it('never returns another member\'s key by accident', () => {
    const g = mkGroup({ 'Damini Gupta': 'damini@x.com', Abhishek: 'abhi-pid' });
    const key = resolveSelfKey(g, { email: 'damini@x.com', firstName: 'Damini', fullName: 'Damini Gupta' });
    expect(key).not.toBe('abhi-pid');
  });
});

// Guards the "Non-Group duplicate flicker": a person keyed by email in a group
// but by raw name in a Non-Group expense showed up twice. buildNameEmailResolver
// lets the Non-Group entry resolve to the same email so they merge into one.
describe('buildNameEmailResolver', () => {
  it('resolves a name to its email when that name has one email across groups', () => {
    const resolve = buildNameEmailResolver([
      mkGroup({ 'Chirag Gupta': 'chirag@x.com', You: 'me@x.com' }),
      mkGroup({ 'Chirag Gupta': 'chirag@x.com' }),
    ]);
    expect(resolve('Chirag Gupta')).toBe('chirag@x.com');
    expect(resolve('chirag gupta')).toBe('chirag@x.com'); // case-insensitive
    expect(resolve('Chirag Gupta (Left)')).toBe('chirag@x.com'); // strips (Left)
  });

  it('returns undefined for an ambiguous name (two people, two emails)', () => {
    const resolve = buildNameEmailResolver([
      mkGroup({ Chirag: 'chirag1@x.com' }),
      mkGroup({ Chirag: 'chirag2@x.com' }),
    ]);
    expect(resolve('Chirag')).toBeUndefined();
  });

  it('returns undefined for a name-only person (no email anywhere)', () => {
    const resolve = buildNameEmailResolver([mkGroup({ Chirag: 'pid-123' })]);
    expect(resolve('Chirag')).toBeUndefined();
  });

  it('returns undefined for an unknown name', () => {
    const resolve = buildNameEmailResolver([mkGroup({ Chirag: 'chirag@x.com' })]);
    expect(resolve('Nobody')).toBeUndefined();
  });
});

// upiFor reads a person's UPI anchored on EMAIL, never raw name — so two
// same-named people can't clobber each other and the payer can't autofill the
// WRONG person's UPI. Synced UPIs live in userMetadata under the email key.
describe('upiFor (email-anchored UPI lookup)', () => {
  const byName = (map: Record<string, string>) => (n: string) => map[n];

  it('reads the UPI stored under the resolved email key', () => {
    const md = { 'chirag@x.com': { upiId: 'chirag@upi' } };
    expect(upiFor(md, byName({ Chirag: 'chirag@x.com' }), 'Chirag')).toBe('chirag@upi');
  });

  it('is case-insensitive on the email key', () => {
    const md = { 'chirag@x.com': { upiId: 'chirag@upi' } };
    expect(upiFor(md, byName({ Chirag: 'CHIRAG@X.COM' }), 'Chirag')).toBe('chirag@upi');
  });

  it('never returns another same-named person\'s UPI when the name is ambiguous', () => {
    // ambiguous name -> resolver returns undefined -> must NOT leak an email UPI
    const md = { 'chirag1@x.com': { upiId: 'wrong@upi' } };
    expect(upiFor(md, () => undefined, 'Chirag')).toBeUndefined();
  });

  it('falls back to the name key (own / locally-linked UPI) when no email resolves', () => {
    const md = { You: { upiId: 'me@upi' } };
    expect(upiFor(md, () => undefined, 'You')).toBe('me@upi');
  });

  it('prefers the email-anchored UPI over a stale name-keyed one', () => {
    const md = { 'chirag@x.com': { upiId: 'real@upi' }, Chirag: { upiId: 'stale@upi' } };
    expect(upiFor(md, byName({ Chirag: 'chirag@x.com' }), 'Chirag')).toBe('real@upi');
  });

  it('tolerates empty metadata', () => {
    expect(upiFor(undefined, () => 'a@x.com', 'Chirag')).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import {
  MAX_INVITE_SPOTS,
  encodeInviteParam,
  parseInviteParam,
  buildPersonInviteLink,
  personInviteMessage,
  groupCardGreeting,
  groupInviteMessage,
  InviteSpot,
} from './inviteLink';

// Realistic ids per the design: UUID, `gid-<base36>-<base36>`, or a digit
// string — never containing '.' or ','.
const spot = (n: number): Required<InviteSpot> => ({ groupId: `gid-${n}-abc`, memberKey: `mk-${n}` });

describe('encodeInviteParam / parseInviteParam round-trip', () => {
  it('round-trips a list of spots', () => {
    const spots = [spot(1), spot(2), spot(3)];
    const encoded = encodeInviteParam(spots);
    expect(encoded).toBe('gid-1-abc.mk-1,gid-2-abc.mk-2,gid-3-abc.mk-3');
    expect(parseInviteParam(encoded)).toEqual(spots);
  });

  it('percent-encodes each half so ids/keys with reserved characters survive', () => {
    const spots = [{ groupId: 'gid-1-abc', memberKey: 'mk with space & stuff' }];
    const encoded = encodeInviteParam(spots);
    expect(parseInviteParam(encoded)).toEqual(spots);
  });

  it('drops spots without a memberKey when encoding', () => {
    const encoded = encodeInviteParam([spot(1), { groupId: 'gid-2-abc' }, spot(3)]);
    expect(encoded).toBe('gid-1-abc.mk-1,gid-3-abc.mk-3');
  });

  it('caps encoding at MAX_INVITE_SPOTS', () => {
    const many = Array.from({ length: 15 }, (_, i) => spot(i));
    const encoded = encodeInviteParam(many);
    expect(encoded.split(',')).toHaveLength(MAX_INVITE_SPOTS);
  });
});

describe('parseInviteParam robustness', () => {
  it('returns an empty list for empty/nullish input', () => {
    expect(parseInviteParam('')).toEqual([]);
    expect(parseInviteParam(null)).toEqual([]);
    expect(parseInviteParam(undefined)).toEqual([]);
  });

  it('drops segments missing a half', () => {
    expect(parseInviteParam('.')).toEqual([]);
    expect(parseInviteParam('gid-1-abc.')).toEqual([]);
    expect(parseInviteParam('.mk-1')).toEqual([]);
    expect(parseInviteParam('no-dot-here')).toEqual([]);
  });

  it('drops a segment whose decoded half still contains "." or ","', () => {
    // "a%2Eb" decodes to "a.b" — ambiguous with the separator, must be dropped.
    expect(parseInviteParam('gid-1-abc.a%2Eb')).toEqual([]);
    expect(parseInviteParam('gid-1-abc.a%2Cb')).toEqual([]);
  });

  it('never throws on malformed percent-encoding or pure noise', () => {
    expect(() => parseInviteParam('%E0%A4%A')).not.toThrow();
    expect(parseInviteParam('%E0%A4%A')).toEqual([]);
    expect(() => parseInviteParam('gid-1-abc.%E0%A4%A')).not.toThrow();
    expect(parseInviteParam('gid-1-abc.%E0%A4%A')).toEqual([]);
    expect(() => parseInviteParam('...')).not.toThrow();
    expect(parseInviteParam('...')).toEqual([]);
    expect(() => parseInviteParam(',,,')).not.toThrow();
    expect(parseInviteParam(',,,')).toEqual([]);
  });

  it('dedupes repeated spots while preserving first-seen order', () => {
    const raw = [spot(1), spot(1), spot(2), spot(1)].map((s) => `${s.groupId}.${s.memberKey}`).join(',');
    expect(parseInviteParam(raw)).toEqual([spot(1), spot(2)]);
  });

  it('caps parsing at MAX_INVITE_SPOTS even when de-duplication would otherwise allow more', () => {
    const dupes = Array.from({ length: 5 }, () => spot(1));
    const uniques = Array.from({ length: 10 }, (_, i) => spot(i + 2));
    const raw = [...dupes, ...uniques].map((s) => `${s.groupId}.${s.memberKey}`).join(',');
    const parsed = parseInviteParam(raw);
    expect(parsed).toHaveLength(MAX_INVITE_SPOTS);
    expect(parsed[0]).toEqual(spot(1));
  });
});

describe('buildPersonInviteLink', () => {
  const origin = 'https://divido.app';

  it('builds a multi-group invite link covering only the keyed spots', () => {
    const spots: InviteSpot[] = [spot(1), { groupId: 'gid-2-abc' }, spot(3)];
    const result = buildPersonInviteLink(origin, spots, 'gid-fallback');
    expect(result.url).toBe(`${origin}/?invite=${encodeInviteParam([spot(1), spot(3)])}`);
    expect(result.coveredGroupIds).toEqual(['gid-1-abc', 'gid-3-abc']);
  });

  it('falls back to the legacy single-group link when no spot has a memberKey', () => {
    const spots: InviteSpot[] = [{ groupId: 'gid-1-abc' }, { groupId: 'gid-2-abc' }];
    const result = buildPersonInviteLink(origin, spots, 'gid-fallback');
    expect(result.url).toBe(`${origin}/?joinGroupId=gid-fallback`);
    expect(result.coveredGroupIds).toEqual(['gid-fallback']);
  });

  it('falls back when there are no spots at all', () => {
    const result = buildPersonInviteLink(origin, [], 'gid-fallback');
    expect(result.url).toBe(`${origin}/?joinGroupId=gid-fallback`);
  });

  it('caps the covered groups at MAX_INVITE_SPOTS', () => {
    const spots = Array.from({ length: 15 }, (_, i) => spot(i));
    const result = buildPersonInviteLink(origin, spots, 'gid-fallback');
    expect(result.coveredGroupIds).toHaveLength(MAX_INVITE_SPOTS);
  });
});

describe('personInviteMessage', () => {
  it('names a single group', () => {
    expect(personInviteMessage('Priya', ['Goa Trip'])).toBe('Hey Priya! Join Goa Trip on Divido to split expenses 💸');
  });

  it('joins two groups with "&"', () => {
    expect(personInviteMessage('Priya', ['Goa Trip', 'Flat 402'])).toBe(
      'Hey Priya! Join Goa Trip & Flat 402 on Divido to split expenses 💸',
    );
  });

  it('names the first two and counts the rest for three groups', () => {
    expect(personInviteMessage('Priya', ['Goa Trip', 'Flat 402', 'Office Lunch'])).toBe(
      'Hey Priya! Join Goa Trip, Flat 402 & 1 more on Divido to split expenses 💸',
    );
  });

  it('names the first two and counts the rest for five groups', () => {
    expect(personInviteMessage('Priya', ['Goa Trip', 'Flat 402', 'A', 'B', 'C'])).toBe(
      'Hey Priya! Join Goa Trip, Flat 402 & 3 more on Divido to split expenses 💸',
    );
  });

  it('falls back to "your group" for an empty group name', () => {
    expect(personInviteMessage('Priya', [''])).toBe('Hey Priya! Join your group on Divido to split expenses 💸');
  });
});

describe('groupCardGreeting', () => {
  it('greets generically with no pending names', () => {
    expect(groupCardGreeting([])).toBe('Hey!');
  });

  it('names one pending person', () => {
    expect(groupCardGreeting(['Rahul'])).toBe('Hey Rahul!');
  });

  it('joins two with "&"', () => {
    expect(groupCardGreeting(['Rahul', 'Priya'])).toBe('Hey Rahul & Priya!');
  });

  it('joins three with commas and "&"', () => {
    expect(groupCardGreeting(['Rahul', 'Priya', 'Amit'])).toBe('Hey Rahul, Priya & Amit!');
  });

  it('collapses to "everyone" beyond three', () => {
    expect(groupCardGreeting(['Rahul', 'Priya', 'Amit', 'Neha'])).toBe('Hey everyone!');
  });
});

describe('groupInviteMessage', () => {
  // Reproduces today's formula from onInviteToGroup in src/App.tsx, so we can
  // assert the new helper preserves it byte-for-byte for <=3 names.
  const legacyJoinNames = (names: string[]): string => {
    if (names.length <= 1) return names[0] || '';
    if (names.length <= 3) return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
    return `${names.slice(0, 2).join(', ')} & ${names.length - 2} others`;
  };
  const legacyMessage = (names: string[], groupName: string): string => {
    const who = legacyJoinNames(names);
    return `Hey${who ? ` ${who}` : ''}! Join ${groupName ? `"${groupName}"` : 'my group'} on Divido to split expenses 💸`;
  };

  it.each([[[]], [['Rahul']], [['Rahul', 'Priya']], [['Rahul', 'Priya', 'Amit']]])(
    'matches the current group-card share text for %j',
    (names) => {
      expect(groupInviteMessage(names, 'Goa Trip')).toBe(legacyMessage(names, 'Goa Trip'));
    },
  );

  it('quotes a named group and uses "my group" (no quotes) when unnamed', () => {
    expect(groupInviteMessage(['Rahul'], 'Goa Trip')).toBe('Hey Rahul! Join "Goa Trip" on Divido to split expenses 💸');
    expect(groupInviteMessage(['Rahul'], '')).toBe('Hey Rahul! Join my group on Divido to split expenses 💸');
  });
});

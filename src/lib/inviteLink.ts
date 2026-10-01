// Multi-group person invite links: one shareable link that can seat a person
// into several groups at once via a `?invite=<gid>.<memberKey>,<gid>.<memberKey>`
// query param. Pure module — no React, no Supabase, no `window` access, so the
// caller always passes `origin` explicitly. The parser is fed attacker-supplied
// URL input, so it must never throw, no matter how malformed the string is.

// A group id is a UUID, `gid-<base36>-<base36>`, or a digit string — none of
// which contain '.' or ',' — so those two characters are safe as separators.
export interface InviteSpot {
  groupId: string;
  memberKey?: string;
}

export const MAX_INVITE_SPOTS = 10;

// Encode this person's invite spots into the value of the `invite` query
// param. Spots without a memberKey can't be represented and are dropped.
export const encodeInviteParam = (spots: InviteSpot[]): string =>
  spots
    .filter((s) => s.groupId && s.memberKey)
    .slice(0, MAX_INVITE_SPOTS)
    .map((s) => `${encodeURIComponent(s.groupId)}.${encodeURIComponent(s.memberKey as string)}`)
    .join(',');

// Parse a raw `invite` param back into a deduped, order-preserving list of
// spots. Never throws: malformed percent-encoding, missing halves, and
// segments whose decoded parts still contain '.' or ',' (which would make the
// separator ambiguous) are silently dropped. Capped at MAX_INVITE_SPOTS.
export const parseInviteParam = (raw: string | null | undefined): Required<InviteSpot>[] => {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: Required<InviteSpot>[] = [];

  for (const segment of raw.split(',')) {
    if (out.length >= MAX_INVITE_SPOTS) break;

    const dotIdx = segment.indexOf('.');
    if (dotIdx <= 0 || dotIdx === segment.length - 1) continue; // missing a half

    let groupId: string;
    let memberKey: string;
    try {
      groupId = decodeURIComponent(segment.slice(0, dotIdx));
      memberKey = decodeURIComponent(segment.slice(dotIdx + 1));
    } catch {
      continue; // malformed percent-encoding
    }
    if (!groupId || !memberKey) continue;
    if (groupId.includes('.') || groupId.includes(',') || memberKey.includes('.') || memberKey.includes(',')) continue;

    const dedupeKey = `${groupId}\u0000${memberKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ groupId, memberKey });
  }
  return out;
};

export interface PersonInviteLink {
  url: string;
  // Groups this link actually seats the person into, so the share message
  // only names groups the link covers.
  coveredGroupIds: string[];
}

// Build the full person invite link. Spots without a memberKey are skipped.
// If no spot has a memberKey at all, falls back to the legacy single-group
// link so the person can still join something.
export const buildPersonInviteLink = (origin: string, spots: InviteSpot[], fallbackGroupId: string): PersonInviteLink => {
  const keyed = spots.filter((s): s is Required<InviteSpot> => !!s.groupId && !!s.memberKey);
  if (keyed.length === 0) {
    return { url: `${origin}/?joinGroupId=${fallbackGroupId}`, coveredGroupIds: [fallbackGroupId] };
  }
  const capped = keyed.slice(0, MAX_INVITE_SPOTS);
  return {
    url: `${origin}/?invite=${encodeInviteParam(capped)}`,
    coveredGroupIds: capped.map((s) => s.groupId),
  };
};

// "Goa Trip", "Goa Trip & Flat 402", "Goa Trip, Flat 402 & 1 more".
const joinGroupNames = (names: string[]): string => {
  if (names.length === 0) return 'your group';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} & ${names.length - 2} more`;
};

// Share message for a person invite link. `groupNames` are the display names
// of the groups the link covers (see `coveredGroupIds`); an empty name
// becomes "your group".
export const personInviteMessage = (name: string, groupNames: string[]): string => {
  const cleaned = groupNames.map((n) => n || 'your group');
  return `Hey ${name}! Join ${joinGroupNames(cleaned)} on Divido to split expenses 💸`;
};

// "Hey Rahul!", "Hey Rahul & Priya!", "Hey Rahul, Priya & Amit!" for up to 3
// pending names; "Hey everyone!" beyond that; "Hey!" for none.
export const groupCardGreeting = (names: string[]): string => {
  if (names.length === 0) return 'Hey!';
  if (names.length > 3) return 'Hey everyone!';
  if (names.length === 1) return `Hey ${names[0]}!`;
  return `Hey ${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}!`;
};

// Full share text for a group card's "Invite"/"Remind" action. For <=3
// pending names this reproduces the exact wording used today (see
// onInviteToGroup in src/App.tsx): "Hey <names>! Join "<name>" on Divido to
// split expenses 💸", falling back to "my group" (no quotes) for an unnamed
// group. Beyond 3 names the greeting collapses to "Hey everyone!".
export const groupInviteMessage = (names: string[], groupName: string): string =>
  `${groupCardGreeting(names)} Join ${groupName ? `"${groupName}"` : 'my group'} on Divido to split expenses 💸`;

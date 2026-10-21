# Non-Group identity (like groups) — plan

**Goal:** plain Non-Group expenses identify people by a **permanent id** (plus
email when known), the way groups already do, so look-alike names, renames and "is this me?" guesses stop
breaking balances, Settle up, Delete and sharing.

**Owner note:** Chirag is actively changing Non-Group (share links, claim card,
delete, settle across thread + Non-Group). Agree who does which step before
starting; nobody edits `NonGroupView.tsx` / `nonGroupPeople.ts` in parallel.

## Today

| Part | How a person is identified |
| --- | --- |
| Groups | `group_members` row: email + permanent `member_key`; expenses carry keys |
| Shared Non-Group thread (after the link) | Same as groups (hidden 2-person group, `is_direct`) |
| Plain Non-Group expense (`gId = 'STANDALONE'`) | **Name strings only**, local to the phone + cloud backup. Friend's email only if typed (`otherEmail`). "Is me" = name comparison (`makeIsMe`, `NonGroupView.isMe`) |

Bugs this caused (Oct 2026): a friend sharing my first name hidden as me; the
same person split into several cards; sharing created a second, empty thread
(matched by name); Settle up empty after a join renamed someone.

## Target

Same model as groups: every Non-Group friend gets a **permanent id** the moment
they're added (`otherKey`, "ngp-…", like a member's `member_key`). **Email
stays optional**, as in groups; it's only required when a second friend uses a
name I already have (same rule as groups). Every plain Non-Group expense stores:

- `otherKey` — the friend's id (always, for a 2-person split)
- `otherEmail` — the friend's email, if known
- `myEmail` — the account that wrote it (who "me" is)

People are grouped by `otherKey` (then email, then name for old rows); "is me" by
`myEmail`. When the friend joins via the share link, their id links to the
account, like claiming a group spot.

## Steps

1. **Friend ids at pick time (UI) — DONE 2026-10-21.**
   Picker suggestions include my existing Non-Group friends (with their id).
   Picking one reuses the id; a new person gets a new id
   (`resolveNonGroupFriendKey`). Email optional; required only on a same-name
   clash; my own email is refused.

2. **Save id + emails on every Non-Group expense (write path) — DONE (modal).**
   `useExpenseForm` save: set `otherEmail` (exists) and new `myEmail`.
   Also `quickAddExpenseWithFriend`, `openPersonalExpense`, scan-bill and
   Splitwise import. Add `myEmail` to `types.ts` and the cloud backup payload.
   Old rows keep working (fields optional).

3. **Read by email (engine).**
   - `computeNonGroupPeople`: person key = `otherEmail` when present (already
     partly there), else name.
   - "Is me": `myEmail` match first; then account email in thread
     `memberIdentities`; name rules only for rows with no email.
   - Balances for STANDALONE (`getMemberBalance('STANDALONE', …)`) bucket by the
     same person key, so two names with one email are one balance.
   Unit tests in `nonGroupPeople.test.ts` for each case below.

4. **Sharing + delete + settle use the email (flows).**
   - `sharePersonNonGroupBeta`: find/create the thread by `otherEmail` (thread id
     first — done 2026-10-21), seed the invite with it so the link auto-matches.
   - `deletePersonNonGroup` / Settle up: select expenses by person key, not name.

5. **Backfill old expenses (one-time, on the phone).**
   On start, for STANDALONE rows missing emails: fill `myEmail` with my account
   email; fill `otherEmail` when the name maps to exactly ONE email across my
   groups / threads (`buildNameEmailResolver`). Ambiguous → leave, and show a
   small "Add email for X" prompt on that person's card.

## Test cases (must pass before release)

- Friend "Damini Gupta" on a "Damini …" account shows as a separate card.
- Same email saved as "Chirag" and "Chirag Gupta" → one card, one balance.
- Rename a friend → card, balance, Settle up and Delete still work.
- Share a person twice → same thread, same link; joiner lands inside.
- Old expense with no email still shows (name fallback) and gets backfilled
  when the name is unambiguous.
- Personal ("You") expenses unaffected.

## Size

About a day: steps 1–2 (half), 3 (a few hours + tests), 4–5 (a few hours).
Ship 1–2 first (only adds data), then 3–5 together after a two-phone check.

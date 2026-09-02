# Add-Friend, Identity & Settlement — Design Spec

Status: **agreed design, not yet built** (2026-08-31). Reference for the upcoming
add-friend / identity / removal work. Read alongside `HANDOFF.md` and memory
`divido-person-identity`, `divido-sync-risks`.

This spec captures a long design discussion with the owner. The goal: make
add-friend feel like Splitwise, and remove the repeated "is this the same
person?" prompt, without breaking balances.

---

## 1. Identity — the core rule

**A person is identified by their EMAIL. Everything else is display.**

Identity ladder (strongest wins), already reflected in `getPersonKey`:
1. **Email** (Google sign-in, or one you typed) — the trusted, unique identity.
2. **`person_id`** (hidden UUID) — fallback for name-only members.
3. **Name** — display label ONLY, never the identity.

- **Phone is a HINT, not an identity.** We do not verify phone numbers (no SMS/OTP),
  so a typed/contact phone is stored for display/convenience only. Add-by-email and
  add-by-phone for the same person will **NOT** auto-merge. Accepted limitation.
- Why email works: it is globally unique and Google-verified at sign-in, so the app
  can be *certain* two spots are the same person — no prompt needed.

### Why this kills the repeated prompt
The "same person?" prompt exists only because names aren't unique. Once a person has
an email, the app answers the question itself and stops asking. The prompt survives
ONLY as a rare fallback for name-only people with no email.

---

## 2. Add-friend UI

Single smart input the user types into; it detects name vs email vs phone.

- Type a **name** → show matching people (suggestions) or "Add as new".
- Type an **email/phone** → link that as identity/hint.
- **Suggestions** = people you've split with before (across your groups), each shown
  with **photo + name + email (and phone if known)**. Tapping one adds them already
  linked → no prompt. Email is shown deliberately, to disambiguate same-named people
  (e.g. two "Chirag Gupta" with different emails = two rows, told apart by email).
- Entry methods offered: **From contacts** (native app only — stubbed "in the app"
  in the PWA), **By email**, **Invite via link** (already built), **New member**.

Suggestions source ("people you've split with") is an index to be built across all of
the user's groups. (Loose end — not built yet.)

---

## 3. Invite / join / claim flow

Matching is by **exact email** of the signed-in invitee against the pending spot.

| Spot created as | Invitee signs in as | Result |
|---|---|---|
| email `x@gmail.com` | `x@gmail.com` (exact) | **Silent auto-claim.** No questions. |
| email `x@gmail.com` | a different email | One "claim or join new" card |
| name-only "bhaiya" | any account | One "claim or join new" card |
| any spot | not signed in | Sign in with Google first, then re-run |
| any spot | email already a member | Just open group as themselves |

The **claim + merge card** (only shown when NOT certain):
> "Join as bhaiya? Their past expenses and balance become yours."
> [ Yes, that's me — merge ] [ No, add me as new ]

On claim/merge, the placeholder name must be linked to the joiner's email in
`memberIdentities` so old expenses (stored by name string) resolve to them.
(Loose end #2 — the linking work; adjacent to Stage 5.)

---

## 4. Display rules

- **Photo + name** shown to everyone in the group.
- **Email** shown under the name (Splitwise-style) to disambiguate same-named people.
- **Once a person JOINS with their account, show their profile name** everywhere
  (group + global). The typed name is only a **placeholder until they join**.
- **Global "All balances"** collapses a person into **ONE row** by identity (email),
  with a **combined balance** across groups, shown under their **profile name**.
  (Verify current Friends/global view keys by identity across groups — may need a fix.)

---

## 5. Renaming

- **Joined members: NOT renameable.** Their name is their profile name — theirs, not
  yours. (Also deletes a whole class of rename-orphans-balance bugs.)
- **Pending placeholders: editable** (it's a label you typed) until they claim it.
  A placeholder with expenses still needs the balance-safe rewrite (`applyRename`) —
  now a rare, contained path.

---

## 6. Removal / leaving — the Splitwise path

**A member (pending OR joined) cannot leave or be removed until their balance is ZERO
in every currency.** The rule keys on *money*, not join status.

| Member | Has a balance? | Removable? |
|---|---|---|
| Just invited | No | Yes — instant (cancel invite) |
| In expenses (pending or joined) | Yes | No — settle/write off first |

- "Zero" means zero across **all currencies** (loose end #3 — enforce per-currency).

### Permissions
- **Admin** removes others.
- **Anyone** can remove themselves (leave) — same zero-balance rule.
- **Regular members** cannot remove other people.
- **Admin leaving** needs an admin-transfer/auto-promote rule (loose end #4).

### Past / Left members
- Because removal always leaves zero balance, there is **no "left but still owing"
  state.** "Past Members" shrinks to a lightweight **"Left" history + Re-invite**
  option. No balance tracking, no clutter.
- Data note: a person who touched expenses is never hard-deleted (expenses reference
  their name / analytics need them) — kept tombstoned in data, just not shown as an
  active member.

---

## 7. Settle cards — direction-dependent

Options depend on which way the money flows.

**When THEY owe YOU (you are owed) — 3 options:**
1. **Remind** — nudge them
2. **Settle up** — record they paid (real money)
3. **Write off** — forgive it (can't recover)

**When YOU owe THEM (you are the debtor) — 1 option:**
1. **Pay / Settle up**

### Write-off rules
- **Write off lives INSIDE the settle card**, as an alternative to recording a payment.
- **Only the person who is OWED can write off** — it's their money to forgive. This
  makes cross-party erasing impossible: you can never write off a debt between two
  other people. Write-off only appears on balances in your favour.
- **Settle up** = real payment recorded. **Write off** = forgiven, and is EXCLUDED
  from Analytics/Total Spent (as today). Write-off ids stay deterministic (double-tap /
  two-device safe).
- To remove a member with multiple open balances, each pair must reach zero (settle or
  write off); the person owed resolves their own share.

### "Remind" mechanism
Assumes a delivery channel. Today = generate a nudge/share message (no real push/email
until native/push exists). (Loose end #5 — be explicit it's not a notification yet.)

---

## 8. What stays unchanged
- Joined / Pending / (lightweight) Left sections and their controls.
- Invite link + claim flow (already built).
- Balance engine, identity resolution via `getPersonKey` / `balancesByIdentity`.

---

## 9. Known loose ends (must not be mistaken for bugs)
1. **Two-device sync** — claim/merge races. Depends on HANDOFF #1 (two-phone test).
   Build this AFTER sync is proven.
2. **Placeholder → identity linking** on claim (expenses keyed by name string).
3. **Multi-currency zero** check on removal.
4. **Admin leaving** → admin transfer rule.
5. **"Remind"** delivery = share message, not push (for now).
6. **Suggestions index** ("people you've split with") — to be built.
7. **Unverified phone** → add-by-email and add-by-phone won't auto-merge. Accepted.

---

## 10. Build order (recommended)
1. **Two-phone sync test/audit** (HANDOFF #1) — de-risks claim/merge first.
2. Identity + display rules (email = identity, profile name on join, email shown).
3. Settle-card write-off (creditor-only) + Splitwise "zero-to-remove" rule.
4. New add-friend single-input UI + suggestions index.
5. Native app → contacts picker + phone hints (later).

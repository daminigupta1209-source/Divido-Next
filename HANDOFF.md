# Divido-Next — Handoff

React + Vite expense-splitting **PWA**. Backend: **Supabase** (Postgres + RLS + realtime + storage). Deploy: push to `main` → **Vercel** auto-deploys. Live URL: https://divido-next.vercel.app

> Latest commit at handoff: **185c4ee** (identity-reuse for suggestions + email validation, SW cache **v89**). Everything below is live on `main`.
> The **"Session 2026-09-02"** section is the freshest work — read it first, then 2026-09-01, then 2026-08-27/28.

## Working rules
1. **Verify every change with `npm run build`** (`tsc -b && vite build`). A failed build silently leaves the OLD version live on Vercel.
2. **Push straight to `main`** (owner doesn't use preview links). Compensate with careful build + logic verification.
3. **DB changes:** the assistant does NOT connect to Supabase directly. When a schema change is needed, hand the owner the exact SQL to run in the Supabase SQL Editor, and (if the new code depends on it) run the SQL FIRST, then push code.
4. **One task at a time**; after each change show what changed and stop for confirmation.
5. Owner prefers **plain language** and **simple, short UI copy**. Use **"pay"/"collect"**, never "owe"/"owed". No emojis in the leave/remove/write-off cards.

---

## Data model — CURRENT state (important)

### IDs are now permanent & client-generated (no temp→DB swap)
This was the biggest fix theme. Previously groups AND expenses got a temporary float id (`Date.now()+…`) that was swapped for a DB integer after insert — causing a race (create-then-edit duplicated/lost edits; create-then-delete resurrected the row; expenses stranded/vanished).

- **`groups.id`** → **text** (client UUID via `genGroupId()` in `src/lib/utils.ts`). Never changes.
- **`expenses.id`** → **text** (client UUID via `genExpenseId()`). Never changes.
- **`group_members.group_id`** and **`expenses.group_id`** → **text** (FK to `groups.id`).
- A client-only `Group.pendingSync` flag (in `src/lib/types.ts`) replaced the old `<= 2147483647` "is this synced?" heuristic. Set true at creation, cleared once the row is inserted.
- `group_members.person_id` (text/uuid) exists in the live DB (per-person hidden identity so same-named people don't merge across groups). NOTE: it's absent from `api/schema.sql` — added via ad-hoc ALTER.

### SQL migrations already run (in the live DB)
Saved in `api/`:
- `api/migrate_group_ids_to_text.sql` — groups/group_members/expenses `group_id`+`groups.id` bigint→text; **did a fresh reset** (test data wiped); drops+recreates RLS policies (a policy referencing the column blocks the retype).
- `api/migrate_expense_ids_to_text.sql` — `expenses.id` bigint→text, **in place (no reset)**; no policy touches expenses.id.

If you spin up a NEW Supabase project, apply `api/supabase_setup.sql` + `api/fix_removed_member_write_access.sql`, then BOTH migrations above, then add `group_members.person_id text`.

### Auth / RLS
**Google sign-in only** (guest option removed — guests had no auth session so RLS blocked their writes). RLS policies key on `group_members.group_id` + `auth.jwt() ->> 'email'`; expenses write requires an ACTIVE (non-"(Left)") member. Realtime on `group_members` + `expenses`.

### Expense shape (`src/lib/types.ts` `Expense`)
People are referenced by **name string**: `paid` (payer name), `splitters` (name[]), `shares`/`origShares` (keyed by name). `splitters` is **NOT NULL** in the DB — always set it (even `[]`). `gId` = group id (text) or the string `'STANDALONE'`. Settlements/write-offs are stored as expenses too.

---

## What this session shipped (all on `main`)

### Permanent IDs & races (the core)
- Permanent **group ids** (UUID, `pendingSync` flag) — killed stranded/vanished/orphaned-expense bugs. `useSupabaseSync.ts` group insert sends the client id, no readback/remap.
- Permanent **expense ids** — killed create-then-edit duplicates & resurrected deletes (settlements too). Sync sends `String(id)`, matches by string, no swap.
- Fixed a missed group-create site (`ExpenseModal` inline "create group") that used a temp id without `pendingSync` → would never sync.

### Add-friend / identity (Stage 2, pragmatic)
- **Unique member names per group** enforced on every entry point (add-friend modal, inline add, and now the create/edit screen `CreateGroupView` — red highlight + shake + blocked save).
- **Rename is balance-safe**: `applyRename` (`src/App.tsx`) now rewrites `paid`, `splitters` AND `shares`/`origShares` (previously shares were orphaned on rename in unequal/% splits).
- Cross-group same-person handled by existing `Group.memberIdentities` + the "same person?" prompt. The full re-key of balances by `person_id` was intentionally NOT done (high risk, low marginal benefit once names are unique per group + identity-bucketing exists). See memory `divido-temp-id-vs-db-id`.

### Claim / join / rejoin
- Claiming a name now **confirms first** ("Join as X? Only continue if you are X").
- Removed the old bug where fresh pending members were wrongly labelled "Rejoin".
- Dormant group (all members left) → **rejoin self-approves** (rejoiner becomes admin); popup copy adapts ("Rejoin instantly?").
- **Guest join removed** → straight to Google sign-in.

### Leave / Remove / Write-off (`src/components/BalanceActionCard.tsx`)
- Bespoke, no-emoji cards. **Leaving/removing never blocks**; if there's money to pay/collect it warns (pay/collect wording, multi-currency) and the member becomes a **Past Member** with balance preserved.
- **Write-off** action on Past Members (`performWriteOff` in `src/App.tsx`): creates settlement-style entries (reuses `computeRawPairwiseTransactions`) that zero the member's balance per person — title **"Written off"**, subline **"X paid Y"**, no emoji, excluded from Analytics. A one-time load heal (`writeOffHealDoneRef`) cleans legacy write-off entries.
- Members with no expense history are hard-deleted; those in expenses are tombstoned as "(Left)".
- Edit-group screen: existing members are **read-only** there (rename/remove go through the member list, which is safe) — the old edit-screen removal silently no-oped on the server and could delete-by-wrong-column.

### Correctness / polish
- **Analytics** excludes settlements (`🤝`), write-offs, and SYSTEM notes from "Total Spent"/categories.
- **Photos**: fixed sync failure (gallery photos saved without `splitters` → NOT-NULL violation that aborted the whole expense-sync pass); sync now coerces `splitters` to `[]`. Added a dashed **"+" tile** (photo-sized) in the newest date group to add more.
- **Deploy UX**: replaced the silent service-worker reload with a **"New version — Reload" bar** (was wiping modal input). See `src/main.tsx`.
- New-group "Add Friend" = orange pill, centered, auto-focuses the new name field; first row shows "You"; green save tick that shakes the Group Name box when empty.
- One-time localStorage reset in `src/main.tsx` keyed on `divido_schema_version = v2-uuid-gid` (ran on migration).

---

## Session 2026-08-27/28 — latest work (freshest, read first)

### Identity is now resolved consistently (biggest theme this session)
People are still stored by **name string**, but resolution is now robust — this killed a family of "2 didi / blank Paid by / duplicate person" bugs:
- **`src/lib/identity.ts` (NEW)** — `getPersonKey(group, name)` is the single source of truth: name → stable key (email → person_id → name), matched **case-insensitively** and across the `(Left)` suffix. Also `cleanMemberName`, `buildKeyToName`, `toIdentitySpace`, `balancesByIdentity`. Unit-tested (`identity.test.ts`).
- **`getMemberBalance` (App.tsx)** is identity-aware: sums every name-bucket that resolves to the same person (so "Ram" in expenses + "Ram (Left)" on the roster read as ONE).
- Every balance surface now resolves the user by **per-group identity** (`divido_identity_<gid>`), not the flat global first name: home **Net Balance total** (MasterSummary), **group cards** (GroupsView), **Balances tab** (FriendsView), the **global settle sheet** (App), and the **expense editor** ("Paid by"/splitters normalized on load). This fixed "All settled up" while cards showed balances, blank "Paid by", empty settle sheets, and self-as-own-friend.
- **On save**, expense `paid`/`splitters`/`shares` are **canonicalized to the roster spelling** (`useExpenseForm`), and **`commitAddMembers` blocks case-insensitive duplicate names** across joined/pending/(Left) — so "didi" can't be added next to "Didi".
- **Same-person prompt now also fires at group CREATION** (`handleCreateGroup`), and `resolvePersonChoice` merges immediately (local `memberIdentities` + DB `person_id`).
- Data cleanup SQL run by owner: normalized mixed-case names in `expenses` (paid/splitters) across all groups.

### Member removal / write-offs
- **Past members are NOT removable** (the ✕ was dropped) — a person with expenses is permanent history; the only action is **Write off** (settle to zero). This retired the whole "remove → resurrect as pending" trap. The "missing members" self-heal now tombstones an orphaned expense-name as `(Left)`, never as an active pending invite.
- **Write-offs are locked-but-editable receipts**: struck-through amount, editable for a **partial** write-off, delete warns ("un-settles it, balance reappears"). Write-off ids are **deterministic** (`writeoff-<gid>-<payer>-<receiver>-<curr>-<date>`) so two devices/double-taps don't double-cancel.

### Two-device SYNC hardening (`useSupabaseSync.ts`) — money-critical
See memory `divido-sync-risks` for the full audit. Fixed: **field-level updates** (expense + group UPDATE send only changed fields — no more whole-row clobber of another device's field); **upsert** inserts (onConflict id — a dup id updates, doesn't abort the batch); **per-row try/catch** (one bad row no longer aborts the pass; baseline advances only for cleanly-synced rows; failed rows/deletes stay pending & retry); **raised mass-delete threshold** (>20 AND >90% — legit bulk deletes go through); functional `setExpenses` for settlements; load preserves **concurrent adds**. STILL OPEN: skip-pull can strand a device on a persistently-failing row (needs a pull-and-merge-on-load redesign); duplicate group-create with expenses (left intentionally — auto-merge would be destructive). **Needs two-phone testing.**

### UX / navigation / wording
- **Wording:** balances read **"You pay ₹X" / "You collect ₹X"** everywhere (was ambiguous "₹X to pay" next to a friend's name).
- **Amounts:** exact figures (11,990 not "12K") with shrink-to-fit, then compact only when unreadable.
- **Back-swipe overhaul:** closing a modal consumes its history entry (no more reopen-on-back); group tabs no longer add history entries (back exits the group in one swipe); a back-swipe on a top-level screen closes an open modal first; the same-person prompt no longer loops on back.
- **Group tab swipe** cycles both directions (40px threshold).
- **Claiming a group name no longer overwrites the account profile name** (Option-3 rule).
- **Android autofill bar FIXED** via `type="search"` on all text inputs (see updated Gotchas) — the earlier "not web-fixable" belief was wrong.
- Focused input **scrolls into view above the keyboard** (global focusin handler, App.tsx).
- Expense card has a **green save tick in the header** (bottom "Save Changes" hides behind the keyboard).
- **Refresh banner** now polls for new deploys (every 60s / on focus / on updatefound), so it actually appears without force-closing (`main.tsx`).

### UI Polish & Navigation (Recent Tweaks)
- **Navigation logic simplified**: Clicking the back arrow from ANY nested view inside a group now ALWAYS takes the user straight to the global home screen (summary view).
- **Bottom Navigation**: Fixed a double-highlighting bug. Now, only "Home" highlights when inside a group (since groups belong to Home). The "Friends" button at the bottom strictly routes to the global Friends view and is decoupled from the group's internal tabs.
- **Analytics UI**: Added the Group Name (`Analytics | [Group Name]`) to the top header when viewing a group's analytics. Shrunk the Insight Carousel card to save screen real estate.
- **Grammar & Copy**: Removed spliced grammar from the 'Remove Member' and 'Write-off' modals. All modals consistently use plain language with "pay"/"collect" wording (e.g., `Balance remaining: You pay ₹665. They will be archived in Past Members.`).

---

## Key files
- `src/App.tsx` — the monolith: state, group/expense handlers, claim/join, leave/remove (`handleDeleteGroup`), `performWriteOff`, `applyRename`, one-time heals.
- `src/hooks/useSupabaseSync.ts` — all cloud sync (load, group/expense/member insert-update-delete, realtime, offline flush). Balance-affecting; change carefully.
- `src/lib/calculations.ts` — balance engine (`simplifyMultiCurrencyDebts`, `computeRawPairwiseTransactions`). Unit-tested (`calculations.test.ts`, `npx vitest run` — 19 pass; the "failing" files are Playwright e2e specs wrongly picked up by vitest).
- `src/lib/utils.ts` — `genGroupId`, `genExpenseId`, `formatExactAmount`/`formatCompactAmount`, currencies, helpers.
- `src/lib/identity.ts` — `getPersonKey` (the name→stable-key resolver), `balancesByIdentity`, `cleanMemberName`. Route ALL person/balance matching through this.
- `src/components/` — `CreateGroupView`, `GroupDetail` → `group-detail/GroupMemberList` + `ExpenseRow`, `ExpenseModal`, `GroupGallery` (photos), `BalanceActionCard`, `PremiumConfirm`, `AddFriendModal`, `SettleModal`, `MobileHeader`, `Sidebar`, `Analytics`/`useAnalytics`, `FriendsView`, `MasterSummary`.

---

## Sync-reconciliation invariants (don't regress)
- **Delete vs pending** is decided by the last-synced snapshot (`prevExpensesRef` / `divido_last_synced_expenses`) in the `useSupabaseSync` load merge: a local expense missing from the cloud is kept only if it was NOT previously synced; if it WAS synced and is now gone, it was deleted remotely → drop it (never re-insert). Fixes cross-device deletion resurrection. Don't revert to a plain "is it in the cloud?" check.
- **Recurring occurrences use a deterministic id** `recur-<templateId>-<date>` (App.tsx auto-log engine), skipped if already present, so two devices can't double-spawn a charge; the template's `nextOccurrence` always advances past processed dates.

## Prior handoff to-dos — addressed
- **Search UI (Activities/Photos):** both already existed & matched; the Photos search bar was actually **broken** (App passed `searchQuery={globalSearchQuery}`, making its `onChange` a no-op). Now locally controlled and typeable, like Activities (`GroupGallery.tsx`).
- **Photo→expense didn't update the tile:** the code edits in place and preserves the attachment; the original failure was the expense-id swap race, now removed by the permanent-expense-id fix. Re-test to confirm; if it still repros, add a targeted reconciliation.

## Session 2026-09-02 — zero-to-remove, settle-card fixes, identity reuse (freshest, read first)

All shipped to `main`. Each change was verified live in the browser (demo mode: run
`VITE_SUPABASE_URL="" VITE_SUPABASE_ANON_KEY="" npx vite` → no cloud clobber → seed
localStorage with `divido_e2e_testing=true` + a mock group; see memory `divido-testing-and-cache`).

### Zero-to-remove enforced (commit `27404f8`)
You can no longer walk away from a live balance. **Leaving a group** or **removing a
member** with a non-zero balance now requires reaching zero first — **Settle up** (record
the payment) or **Write off** (cancel it). The old "Leave anyway" / "Remove anyway" escape
hatches are gone. Applies to self-leave AND removing others (active + pending). Files:
`handleDeleteGroup` (App.tsx), the two ✕ sites in `GroupMemberList.tsx`. New `onSettleMember`
prop threaded App → GroupDetail → GroupMemberList; `BalanceActionCard` now wired for a
secondary button.

### Member-centric balance wording (commit `a26df58`)
The remove card said "You pay ₹X" for ANOTHER person's balance — wrong subject (it's THEM,
not you). Now "**Ravi has ₹500 to pay**". `memberBalanceText` reworded. See memory
`divido-member-balance-wording`. Rule: never phrase someone else's balance as "You …".

### Settle button + wrong figure on the remove card (commit `340fca7`)
Two bugs from two-phone testing:
- **"Settle up" looked dead** — the global settle sheet is `z-index: 4000` but the member-list
  panel is `z-index: 9999`, so it opened BEHIND it. Fix: close the member list first.
- **Wrong balance shown** (e.g. ₹4000 when it should be ₹1000) — the card used a hand-rolled
  `getMemberBalanceByCurrency` that summed the member's total net with EVERYONE and diverged
  from the canonical engine. Rewired to `balancesByIdentity` + `getPersonKey`, **pairwise
  (me ↔ them)**, matching the Settle tab / friend card. (Consistency rule again — see
  `divido-balance-consistency-rule`.)

### Name-only friend suggestions reuse identity + email validation (commit `185c4ee`)
Splitwise-style fix for "suggestions show names with no email":
- **Reuse identity.** `buildPeopleSuggestions` now carries each person's stable identity
  (email, or a name-only person's hidden `person_id`). Picking a *Recently split with*
  suggestion attaches that SAME id to the new group's member → the same name-only friend is
  ONE person across groups, not a fresh duplicate each time. Skips the redundant "same
  person?" prompt. Threaded an `identities` map through `onAdd`/`onAddMembers` →
  `commitAddMembers` and the `samePersonPrompt` queue. Both add paths (AddFriendModal + inline
  member-list add).
- **Validate email.** Email stays optional, but a typed non-empty value must look valid
  (`isValidEmail` in identity.ts) — "that doesn't look like a valid email" — no more junk
  identities. Verified: Ravi reused his pid across two groups (no prompt); junk email blocked,
  valid allowed.

### Tests
`src/lib/identity.test.ts` now has: the cross-screen consistency guard (friend-card net ==
settle-sheet net == group balance; raw == simplified per-person net), `buildPeopleSuggestions`
identity-carry, and `isValidEmail`. `npx vitest run src/lib/identity.test.ts
src/lib/calculations.test.ts` → **31 pass**.

### ⏭️ TO DO NEXT SESSION (start here)
1. **Two-phone test of everything above** — still not done on real devices. Priority.
   Check: (a) can't leave/remove with a balance (Settle/Write-off only); (b) Settle up opens
   the sheet; (c) same-person numbers match across group card / Balances tab / Settle sheet
   (both direction AND amount); (d) same name-only friend added to two groups shows as ONE
   person with combined balance; (e) double write-off from two phones collapses to one entry.
2. **Extend identity-reuse to the create-group screen** (`CreateGroupView` / `handleCreateGroup`
   in App.tsx ~2848). Today it keys new members by email-or-name only; it does NOT carry a
   name-only person's hidden id like the add-friend flow now does. Small follow-up so a person
   added at group-creation also links across groups.
3. **Past Members → lightweight "Left" history + Re-invite** — shrink the Past Members block to
   a compact "Left" history line + an "Invite again" action, drop the balance clutter (balance
   is now always zero once zero-to-remove is enforced, so the old balance display is moot).
4. **`performWriteOff` still matches people by RAW NAME**, not `getPersonKey` (App.tsx ~2218).
   Pre-existing, works for typical cases, but it's the same class the consistency rule warns
   about. Route it through identity keys. Do carefully (money-critical).
5. **Zero-to-remove edge — debts with a THIRD party.** The gate uses the member's PAIRWISE
   balance with ME. If a member owes someone *else* (not me) but is settled with me, removal
   isn't blocked and Write off (which zeroes ALL their balances) is not forced. Acceptable for
   v1 (me-centric model), but note it. Splitwise blocks on total balance.
6. **Multi-currency zero check on removal** — confirm the gate lists every currency (it reads
   `getMemberBalanceByCurrency` which is per-currency, so likely fine — verify).
7. **Admin-leaving → admin transfer / auto-promote** rule (partially there in `handleDeleteGroup`
   — notifies next member; confirm the promotion is real and surfaced).
8. Longer-horizon (unchanged): offline precache-all-code; **Stage 5** permanent `person_id` on
   expenses (kills the raw-name matching at the source — makes #4 moot); native contacts picker.

---

## Session 2026-09-01 — settle/removal redesign + balance-consistency fix

### The money bug that drove this session (fixed)
The global **settle sheet** showed "you collect ₹6523" while the **friend card** said "you pay ₹3517" for the SAME person — opposite direction, wrong total, wrong for every friend. Two root causes, both = not using the single source of truth:
1. The settle sheet had its **own hand-rolled pairwise math** instead of `computeRawPairwiseTransactions`. Fixed by routing the settle effect through the same canonical engine with the same `effectiveMembers`.
2. It decided direction with `item.paidBy === me` — a **per-group transaction name** compared to the flat global `me`. After a claim/rename the per-group name ≠ global name, so every line flipped. Fixed with identity-based `iAmPayer = getPersonKey(payer) === myKey`.
See memory `divido-balance-consistency-rule`. Commits: `71d0672`→`67dbb7b`.

### Rules to prevent this class of bug (enforce in review)
1. **One engine, always.** Every balance/direction goes through `computeRawPairwiseTransactions` / `simplifyMultiCurrencyDebts` / `balancesByIdentity`, with `getPersonKey` for identity. Never hand-roll pairwise math.
2. **Never compare people by raw name for direction.** Ban `=== me` / name-equality; compare identity keys.
3. **Consistency test** now exists — `src/lib/identity.test.ts` › `cross-screen balance consistency`: asserts friend-card net == settle-sheet net == group balance from the one `balancesByIdentity` engine (even when `me`'s per-group name differs), and that raw vs simplified give the same per-person net. `npx vitest run` → 27 pass.

### Settle / removal redesign — status
- ✅ **Write-off inside the settle card** (creditor-only) — shipped (`e73520b`, `222a148`, `71d0672`).
- ⏭️ **Zero-to-remove rule** — can't leave/remove a member until their balance is settled or written off (Splitwise path).
- ⏭️ **Multi-currency zero check** on removal.
- ⏭️ **Admin-leaving → admin transfer / auto-promote** rule.
- ⏭️ **Past Members → lightweight "Left" history + Re-invite** (drop the balance clutter).
- ⏭️ **"Remind"** = clarify it's a share message, not a push (until native).

### Other open tracks (carried forward)
- ⏭️ **Offline hardening** — full precache-all-code (shell precache done).
- ⏭️ **Half 2 — identity re-keying (Stage 5)** — let two identical names coexist in one group (see also TOP priority #2 below).
- ⏭️ **Add-friend** — single smart-input polish (spec in `docs/add-friend-identity-spec.md`).
- ⏭️ **Native app** — real contacts picker (Capacitor; Android first).

---

## TOP priorities right now (2026-08-28)
1. **Two-phone sync test** — the money-sync core was just hardened (field-level updates, upsert, per-row resilience). Before building more sync, confirm on two devices: both add at once; one edits amount while other edits title of the SAME expense (both should survive); settle/write-off same person; offline→online; bulk delete stays deleted. See memory `divido-sync-risks`.
2. **Stage 5 — permanent person IDs on expenses.** The last foundational fix: stamp each expense with a stable `person_id` so casing/spelling/per-group names can never split a person. Contained today via resolve-on-read, but this eliminates it at the source. Big, risky migration — plan first, checkpoints, test.
3. **Deep sync gap** — a persistently-failing row still pauses the pull (device strands). Needs a pull-and-field-merge on load. Do after the two-phone test.

## Open / deferred (not bugs)
- **Rename-request "pending" indicator** — renaming a JOINED member sends a proposal the person must accept; there's no persistent "pending" badge and it can sit unaccepted. By design (their name is theirs); low priority.
- **"Settle up →" then auto-leave** — currently two steps (settle, then leave); left as-is.
- **Native app (Capacitor)** — scaffolded (`android/`, `ios/`, `capacitor.config.ts`, `@capacitor/*`) but NO device plugins and no built APK; owner runs the **PWA**. Contacts on iPhone + a good camera require finishing the native app (Android first: no Mac, $25 one-time; iOS needs a Mac + $99/yr). Full contact picker isn't possible in a web PWA on iOS.
- Optional: consolidate multiple write-off rows into one; make `vitest run` ignore `tests/e2e`.

## Gotchas
- **PWA stale cache** causes most "not working after deploy" reports — on device, fully close & reopen; give Vercel ~1–2 min. There's now a "New version — Reload" bar.
- Member names render capitalized via CSS ("didi" → "Didi").
- **Android autofill bar** (dark key/card/pin bar over inputs) is now **fixed** by using `type="search"` on all text inputs (search inputs are ignored by Android autofill; the search cancel-× is hidden in CSS ~index.css:1218). Keep new text inputs as `type="search"`. The hidden `name="username"` honeypots stay `type="text"` on purpose.
- Balances key people by **name string** — now resolved case-insensitively + per-group via `getPersonKey`/`getMemberBalance` (see the latest-session section). A stray SQL delete can still be resurrected by the running app while it's open (close it first).
- Names render capitalized via CSS; a name is matched ignoring case, so "didi" == "Didi".

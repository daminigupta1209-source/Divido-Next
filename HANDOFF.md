# Divido-Next — Handoff

React + Vite expense-splitting **PWA**. Backend: **Supabase** (Postgres + RLS + realtime + storage). Deploy: push to `main` → **Vercel** auto-deploys. Live URL: https://divido-next.vercel.app

> Latest commit at handoff: **1d52388**. Everything below is live on `main`.

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

## Key files
- `src/App.tsx` — the monolith: state, group/expense handlers, claim/join, leave/remove (`handleDeleteGroup`), `performWriteOff`, `applyRename`, one-time heals.
- `src/hooks/useSupabaseSync.ts` — all cloud sync (load, group/expense/member insert-update-delete, realtime, offline flush). Balance-affecting; change carefully.
- `src/lib/calculations.ts` — balance engine (`simplifyMultiCurrencyDebts`, `computeRawPairwiseTransactions`). Unit-tested (`calculations.test.ts`, `npx vitest run` — 19 pass; the "failing" files are Playwright e2e specs wrongly picked up by vitest).
- `src/lib/utils.ts` — `genGroupId`, `genExpenseId`, currencies, helpers.
- `src/components/` — `CreateGroupView`, `GroupDetail` → `group-detail/GroupMemberList` + `ExpenseRow`, `ExpenseModal`, `GroupGallery` (photos), `BalanceActionCard`, `PremiumConfirm`, `AddFriendModal`, `SettleModal`, `MobileHeader`, `Sidebar`, `Analytics`/`useAnalytics`, `FriendsView`, `MasterSummary`.

---

## Open / deferred (not bugs)
- **Rename-request "pending" indicator** — renaming a JOINED member sends a proposal the person must accept; there's no persistent "pending" badge and it can sit unaccepted. By design (their name is theirs); low priority.
- **"Settle up →" then auto-leave** — currently two steps (settle, then leave); left as-is.
- **Native app (Capacitor)** — scaffolded (`android/`, `ios/`, `capacitor.config.ts`, `@capacitor/*`) but NO device plugins and no built APK; owner runs the **PWA**. Contacts on iPhone + a good camera require finishing the native app (Android first: no Mac, $25 one-time; iOS needs a Mac + $99/yr). Full contact picker isn't possible in a web PWA on iOS.
- Optional: consolidate multiple write-off rows into one; make `vitest run` ignore `tests/e2e`.

## Gotchas
- **PWA stale cache** causes most "not working after deploy" reports — on device, fully close & reopen; give Vercel ~1–2 min. There's now a "New version — Reload" bar.
- Member names render capitalized via CSS ("didi" → "Didi").
- **Android autofill bar** (dark key/card/pin bar over inputs) is OS-level, not web-fixable — needs a native build or a device setting.
- Balances key people by **name string** (mitigated by unique-names-per-group + `memberIdentities`); a stray SQL delete can be resurrected by the running app.

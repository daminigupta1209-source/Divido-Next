# Divido-Next — Handoff / Context

> Resume prompt: **"Read HANDOFF.md and the latest git commits, then continue."**

## What this is
An expense-splitting app (Splitwise/Tricount-style).
- **Stack:** React + Vite + TypeScript, Supabase (tables: groups, group_members, expenses), vanilla CSS.
- **Repo:** GitHub `daminigupta1209-source/Divido-Next`, branch `main`.
- **Deploy:** auto-deploys to Vercel (divido-next.vercel.app) on every push to main.
- **Owner is not a coder** — explain simply.

## How to work
- Verify with `npx tsc --noEmit`. E2E via `npx playwright test` (hits live Supabase).
  Test by driving the app in a browser preview via JS (screenshot tool is unreliable).
- **Ask before any push** — each push deploys live to real users.
- Two assistants (Claude Code + Antigravity) may both edit this repo. Only ONE should
  drive/push at a time; pull latest before editing. Commit narrow (specific files).
- To catch up: `git log --oneline -20` + read the key files below.

## Locked design decisions
- **Account-first.** Guest mode was REMOVED (commit 54de743). Must sign in with Google
  to use the app — create/join groups, etc.
- **Duplicate group names are blocked.**
- Tricount-style "view a group without signing in" = FUTURE v2. Do NOT build now.

## Status Update — August 5, 2026 (Antigravity session)

Changes are **LOCAL ONLY — NOT YET PUSHED**. 6 files modified. Owner must `git add -A && git commit && git push` after review.

### ✅ Completed this session

#### App Bug Fixes
1. **Sync engine deadlock — `members` array mismatch** — The sync comparison in
   `useSupabaseSync.ts` included the `members` array, but `members` is reconstructed
   client-side (not stored in the `groups` DB table). After a leave/remove, the local
   array diverged permanently from the cached snapshot (`"Husky"` vs `"Husky (Left)"`),
   causing an infinite "Unsynced offline changes detected" loop that blocked data loading.
   **Fix:** Removed `members` from both `normalize` and `normalizeGroupsForDiff` functions.

2. **Sync engine deadlock — `undefined` vs `null`/`false` key mismatch** — `emoji` and
   `simplifyDebts` were sometimes `undefined` (omitted by `JSON.stringify`) vs `null`/`false`
   depending on whether the group came from DB or localStorage cache. This caused phantom
   mismatches. **Fix:** Defaulted `emoji` to `|| null` and `simplifyDebts` to `!!value`.

3. **Sync engine deadlock — `prevGroupsRef` not filtered** — Current groups were filtered
   to exclude temp IDs (> 2147483647), but `prevGroupsRef.current` was not, creating a
   persistent length mismatch. **Fix:** Applied the same nonDraft filter to both sides.

4. **Decimal invite ID crash** — Invite links with JavaScript temp IDs containing decimals
   (e.g. `?joinGroupId=1785934246034.3406`) caused Supabase 400 errors because `groups.id`
   is a `bigint`. **Fix:** Added validation in `joinGroupFromQuery` to reject non-integer or
   out-of-range IDs before querying.

5. **Write-lock gating for past/removed members** — All add/edit/settle entry points are
   now view-only for left/removed members:
   - `+ Expense` button: hidden (empty state) or replaced with lock View Only (bottom nav)
   - `+ Friend` button: replaced with green `Rejoin` button for left members
   - Settle popup: gated via `setGlobalSettleDataSecure` wrapper
   - Group header: paperclip attachment hidden, "Simplify Debts" toggle disabled, date editing disabled
   - OAuth redirect in `Login.tsx` now uses `window.location.href` to preserve `?joinGroupId=`

#### E2E Test Fixes
6. **All 5 E2E tests now pass (were 2 failing on clean main).** Changes to `leave-rejoin.spec.ts`:
   - `text=+ Friend` changed to `text=Rejoin` (matches new UI for left members)
   - Modal text updated to `"Rejoin this group?"` (actual modal heading)
   - `#desktop-add-expense-btn` click changed to assert `.not.toBeVisible()` (write-lock hides it)
   - `"Request Rejoin"` button changed to `"Send request"` (actual button text)
   - Added `{ force: true }` to clicks intercepted by modal overlays
   - Added console/HTTP listeners to both Page A and Page B for debugging
   - Wait for Confirm button to be hidden before proceeding (race condition fix)

### Modified files
| File | What changed |
|------|-------------|
| `src/App.tsx` | `joinGroupFromQuery` ID validation, `setGlobalSettleDataSecure` wrapper |
| `src/components/GroupDetail.tsx` | `+ Expense` hidden/disabled, `+ Friend` to `Rejoin` for left users |
| `src/components/Login.tsx` | OAuth `redirectTo` uses `window.location.href` |
| `src/components/group-detail/GroupHeader.tsx` | Paperclip, Simplify Debts, date editing disabled for past members |
| `src/hooks/useSupabaseSync.ts` | 3 sync deadlock fixes (members removal, defaults, prevRef filter) |
| `tests/e2e/leave-rejoin.spec.ts` | Test aligned with new UI (modal text, button text, write-lock) |

### Open / remaining items
- **Database-level write-lock (RLS):** Client-side gating is done, but a tech-savvy user
  could bypass the UI. Consider adding RLS policies that block INSERT/UPDATE on expenses
  for members whose name ends with `(Left)`. Low priority for launch.
- **Invite via plain Login page:** `Login.tsx` now uses `window.location.href` for redirect,
  which should preserve `?joinGroupId=`. Needs manual verification with a real Google sign-in.

---

## Status Update — August 2026 (Claude Code session)

All items below are **committed AND pushed to `main`** (so deployed to Vercel). Owner is
non-technical — was walked through each step. Working tree clean at end of session.

### Completed and deployed this session
1. **True account deletion (`50c46d7`)** — Delete Account now calls a **Supabase Edge
   Function** `delete-account` that runs `auth.admin.deleteUser()` server-side (the client
   cannot delete an auth user). Soft-delete unlink (`(Left)` + null email) kept as fallback
   if the function is unreachable.
   - **The Edge Function IS DEPLOYED** to Supabase project `nxpiitewjlwernaysupm` (deployed
     via Dashboard > Edge Functions > Via Editor). Source of truth in repo:
     `supabase/functions/delete-account/index.ts`. "Verify JWT" is ON (correct).
   - Supabase CLI was added as a devDependency (`npm i supabase --save-dev`), but deploy
     was done via the dashboard, not CLI.
2. **Force Google account picker (`50c46d7`)** — added `queryParams: { prompt: 'select_account' }`
   to BOTH `signInWithOAuth` calls (Login.tsx + the invite claim path in App.tsx). Now the
   "Choose an account" screen always shows, even in incognito.
3. **Clear notifications on deletion (`91f4e17`)** — notifications are keyed by email, so a
   re-signup with the same Google email used to resurface old notifications. Delete flow now
   clears them (client-side + in the Edge Function).
4. **Invite survives Google sign-in (`3a09f45`, `e1a6e76`)** — the `?joinGroupId=` param is
   wiped by the OAuth redirect, which dropped users on an empty home with no claim card. Now
   the invite intent is saved to `localStorage` (`divido_pending_join`) the moment the link
   opens, and restored after sign-in so the claim card reappears. Cleared on claim/cancel and
   after a 15-min expiry. **VERIFIED working end-to-end** (join + rejoin).
5. **No duplicate-key error after joining (`6d910db`)** — after joining, `syncGroups` treated
   the joined group's real DB id as a new group and tried to INSERT it then duplicate key
   (groups_pkey) 409 + blocked the initial cloud load. Now groups with a real (small) DB id
   that aren't in the synced list are skipped for insertion (only large temp-id groups are
   locally-created and need inserting).
6. **Cancel removes a declined group (`5275b54`)** — the claim card only shows when you're NOT
   an active member, so Cancel now drops that group from the local feed (cloud data untouched;
   sync re-adds it only if you're actually a member).
7. **"Removed by admin" vs "You left" banner (`65d55bc`)** — admin-removal and voluntary-leave
   both used the same `(Left)` tag, so removed members wrongly saw "You have left." Now removing
   an active member pushes a new `'removed'`-type notification to that member; GroupDetail shows
   "You were removed from this group by the admin" via the `wasRemovedByAdmin` prop (App derives
   it from the removed member's notifications). Voluntary leaves unchanged.
8. **Minor cleanups (`50c46d7`)** — removed dead `showGlobalAddMenu` state/props and unused
   `isInitialLoadDone`; toast text truncates instead of overflowing.

---

## Status Update — July 31, 2026

### Recently completed
1. **Account-first migration**: Removed Guest Mode entirely; strictly Google Sign-in (54de743).
2. **Delete-account logic**: Unlinks memberships, sets past-member `(Left)` status, signs out (9e3d1b9).
3. **Leave and Rejoin Request Flow**: Fully implemented + E2E tests fixed. This was the
   previous blocking bug (rejoin modal not appearing / `(Left)` name update) — now RESOLVED (1272e30).
4. **Conditional Leave/Delete menu labels** updated to match planned user choices (1272e30).
5. **Perf — fonts**: HTML preconnect + link tags to eliminate FOUT/font lag (4a39e62).
6. **Perf — load speed**: Manual code splitting in `vite.config.ts` + parallelized Supabase
   fetches with `Promise.all` in `useSupabaseSync.ts` (0630f29).
7. **Delete Group for Me**: Added to MobileHeader dropdown for past members (26458d3).
8. **Leave Group confirmation prompts**: Reworded in GroupMemberList modal (d31e5bf).

---

## Key files
- `src/hooks/useSupabaseSync.ts` — cloud sync engine (gated on real session via userEmail);
  parallelized fetches (Promise.all); skips re-inserting joined groups (real DB id guard);
  resolves the load gate on every exit path so the loader can't hang. **Sync comparison now
  excludes `members` array and normalizes `emoji`/`simplifyDebts` defaults to prevent deadlocks.**
- `src/App.tsx` — auth (onAuthStateChange/getSession), `me` identity, handleDeleteGroup,
  invite-claim/rejoin handler (`joinGroupFromQuery` + `divido_pending_join` persistence +
  **decimal ID validation**), Delete Account flow (Edge Function call + notification clear),
  onRemoveMember (sets `Name (Left)` + pushes `'removed'` notification), delete-group-for-me,
  **`setGlobalSettleDataSecure` wrapper for settle gating**.
- `supabase/functions/delete-account/index.ts` — **Edge Function** (Deno) that truly deletes
  the caller's auth user via service_role; also unlinks their memberships + deletes their
  notifications. See its `README.md` for redeploy steps (`supabase functions deploy delete-account`).
- `src/lib/notifications.ts` — notification types (incl. new `'removed'`), fetch/push/clear/subscribe.
- `src/components/` — Login.tsx (Google OAuth + account picker, **redirectTo preserves query params**),
  MobileHeader.tsx (past-member dropdown), Profile.tsx, GroupDetail.tsx (past-member banner incl.
  `wasRemovedByAdmin`, **write-lock: + Expense hidden, + Friend becomes Rejoin for left users**),
  FloatingAddMenu.tsx, group-detail/GroupMemberList.tsx (Leave/Remove prompts, member list),
  **group-detail/GroupHeader.tsx (paperclip/simplify/date disabled for past members)**.
- `vite.config.ts` — manual code-splitting config.
- `api/supabase_setup.sql` — DB schema + Row Level Security setup.
- `tests/e2e/` — leave-rejoin (updated for write-lock UI), realtime-sync, auth-gating, past-member-ui specs.

## Key conventions (gotchas)
- **`(Left)` suffix** marks past members (both voluntary leave AND admin removal) — used
  everywhere for detection/filtering. Removed-vs-left is distinguished ONLY via the `'removed'`
  notification, not the row itself.
- **IDs:** real DB ids are numbers <= 2147483647; locally-created (not-yet-synced) groups/
  expenses use large temp ids (`Date.now()+Math.random()`, > 2147483647). Sync logic keys off this.
- **`me`** = `localStorage['divido_identity_<groupId>']` if set, else `userName.split(' ')[0]`.
- **OAuth round-trip wipes URL query params** — persist anything needed across sign-in to
  localStorage (see `divido_pending_join`).
- **Sync comparison gotcha:** `emoji` can be `undefined`/`null`, `simplifyDebts` can be
  `undefined`/`false` depending on source (DB vs localStorage). Always normalize before
  comparing via `JSON.stringify`.

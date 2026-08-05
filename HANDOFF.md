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

## Status Update — August 2026 (Claude Code session)

All items below are **committed AND pushed to `main`** (so deployed to Vercel). Owner is
non-technical — was walked through each step. Working tree clean at end of session.

### ✅ Completed & deployed this session
1. **True account deletion (`50c46d7`)** — Delete Account now calls a **Supabase Edge
   Function** `delete-account` that runs `auth.admin.deleteUser()` server-side (the client
   cannot delete an auth user). Soft-delete unlink (`(Left)` + null email) kept as fallback
   if the function is unreachable.
   - **The Edge Function IS DEPLOYED** to Supabase project `nxpiitewjlwernaysupm` (deployed
     via Dashboard → Edge Functions → Via Editor). Source of truth in repo:
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
   the joined group's real DB id as a new group and tried to INSERT it → `duplicate key
   (groups_pkey)` 409 + blocked the initial cloud load. Now groups with a real (small) DB id
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

### ⚠️ Open / needs verification
- **Removed member write-lock (permissions):** all add/edit/settle entry points ARE gated
  behind the past-member check (secure setters route through `checkPastMemberAndShowRejoin`).
  When a removed member could still add expenses, it looked like **sync timing** (their client
  hadn't received the removal yet). Needs confirmation: after the removed member **refreshes**,
  are the +Expense/+Friend buttons truly view-only? If still writable after refresh, hunt for
  an ungated path.
- **Invite via the plain Login page (not the claim card):** only the claim-card sign-in path
  persists the invite. If a user somehow signs in via the main Login screen before a claim card
  appears, `Login.tsx` uses `redirectTo: window.location.origin` which drops `?joinGroupId=`.
  Not hardened — low priority since the claim card is the normal entry.
- The `[INVITE]` debug console logs were added then REMOVED (`6d910db`). Don't re-add.

## Status Update — July 31, 2026 (~01:05)

### ✅ Recently completed (this session)
1. **Account-first migration**: Removed Guest Mode entirely; strictly Google Sign-in (54de743).
2. **Delete-account logic**: Unlinks memberships, sets past-member `(Left)` status, signs out (9e3d1b9).
3. **Leave & Rejoin Request Flow**: Fully implemented + E2E tests fixed. This was the
   previous blocking bug (rejoin modal not appearing / `(Left)` name update) — now RESOLVED (1272e30).
4. **Conditional Leave/Delete menu labels** updated to match planned user choices (1272e30).
5. **Perf — fonts**: HTML preconnect + link tags to eliminate FOUT/font lag (4a39e62).
6. **Perf — load speed**: Manual code splitting in `vite.config.ts` + parallelized Supabase
   fetches with `Promise.all` in `useSupabaseSync.ts` (0630f29).
7. **Delete Group for Me**: Added to MobileHeader dropdown for past members (26458d3).
8. **Leave Group confirmation prompts**: Reworded in GroupMemberList modal (d31e5bf).

### 📋 Next up — verify & clean reset
Working tree is CLEAN as of 01:05; all above is committed (not yet confirmed deployed).
1. **Verify**: run `npx playwright test` to confirm all specs green post leave/rejoin work.
2. **Manual 2-person end-to-end** (owner + a friend): create group, add friend BY NAME,
   share invite link, friend signs in with Google and claims their name, confirm live-sync
   both ways + survives refresh. Suspect RLS rules first if something breaks.
3. **Clean reset of scrambled test data** (only BEFORE real users have real data):
   Supabase SQL Editor →
   `DELETE FROM public.expenses; DELETE FROM public.group_members; DELETE FROM public.groups;`

## Key files
- `src/hooks/useSupabaseSync.ts` — cloud sync engine (gated on real session via userEmail);
  parallelized fetches (Promise.all); skips re-inserting joined groups (real DB id guard);
  resolves the load gate on every exit path so the loader can't hang.
- `src/App.tsx` — auth (onAuthStateChange/getSession), `me` identity, handleDeleteGroup,
  invite-claim/rejoin handler (`joinGroupFromQuery` + `divido_pending_join` persistence),
  Delete Account flow (Edge Function call + notification clear), onRemoveMember (sets
  `Name (Left)` + pushes `'removed'` notification), delete-group-for-me.
- `supabase/functions/delete-account/index.ts` — **Edge Function** (Deno) that truly deletes
  the caller's auth user via service_role; also unlinks their memberships + deletes their
  notifications. See its `README.md` for redeploy steps (`supabase functions deploy delete-account`).
- `src/lib/notifications.ts` — notification types (incl. new `'removed'`), fetch/push/clear/subscribe.
- `src/components/` — Login.tsx (Google OAuth + account picker), MobileHeader.tsx (past-member
  dropdown), Profile.tsx, GroupDetail.tsx (past-member banner incl. `wasRemovedByAdmin`),
  FloatingAddMenu.tsx, group-detail/GroupMemberList.tsx (Leave/Remove prompts, member list).
- `vite.config.ts` — manual code-splitting config.
- `api/supabase_setup.sql` — DB schema + Row Level Security setup.
- `tests/e2e/` — leave-rejoin, realtime-sync, auth-gating, past-member-ui specs.

## Key conventions (gotchas)
- **`(Left)` suffix** marks past members (both voluntary leave AND admin removal) — used
  everywhere for detection/filtering. Removed-vs-left is distinguished ONLY via the `'removed'`
  notification, not the row itself.
- **IDs:** real DB ids are numbers ≤ 2147483647; locally-created (not-yet-synced) groups/
  expenses use large temp ids (`Date.now()+Math.random()`, > 2147483647). Sync logic keys off this.
- **`me`** = `localStorage['divido_identity_<groupId>']` if set, else `userName.split(' ')[0]`.
- **OAuth round-trip wipes URL query params** — persist anything needed across sign-in to
  localStorage (see `divido_pending_join`).

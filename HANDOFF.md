# Divido-Next — Handoff / Context

> Resume prompt: **"Read HANDOFF.md and the latest git commits, then continue."**

## What this is
An expense-splitting app (Splitwise/Tricount-style).
- **Stack:** React + Vite + TypeScript, Supabase (tables: groups, group_members, expenses), vanilla CSS.
- **Repo:** GitHub `daminigupta1209-source/Divido-Next`, branch `main`.
- **Deploy:** auto-deploys to Vercel (divido-next.vercel.app) on every push to main.
- **Owner is not a coder** — explain simply.

## How to work
- Verify with `npx tsc --noEmit`. Test by driving the app in a browser preview via JS
  (screenshot tool is unreliable). Signed-in flows need a real Google login.
- **Ask before any push** — each push deploys live to real users.
- Two assistants (Claude Code + Antigravity) may both edit this repo. Only ONE should
  drive/push at a time; pull latest before editing. Commit narrow (specific files).
- To catch up: `git log --oneline -20` + read the key files below.

## Locked design decisions
- **Account-first.** Guest = private, LOCAL-only on that device (no cloud sync).
  Must sign in with Google to **create** a group or **join** one via invite link.
- **Duplicate group names are blocked.**
- Tricount-style "view a group without signing in" = FUTURE v2 (needs secret share-links
  + anon read rules). Do NOT build now.

## Done & live
- Guests fully local; cloud sync only for real signed-in users (fixed group data-loss).
- Collision-proof group IDs + double-tap guard + auto-repair of duplicate IDs.
- Sign-in required to create a group and to join via invite link (guests nudged to Profile).
- Per-group identity ("didi"/"pookie") hydrated from account (correct across devices).
- Display name adopts real Google name after guest -> sign-in (was stuck "Guest").
- "Continue as Guest" fully signs out first (clean unlinked guest; persists across refresh).
- Supabase Row Level Security ON (ran api/supabase_setup.sql).
- Fixed sticky +Friend/+Expense buttons in empty-group view (removed hover-up conflict).
- Playwright e2e tests updated to the new flow (button rename, guest vs Google, isolated port).

## Next up — clean reset, then verify
Old data is scrambled test junk — safe to wipe NOW, never once real users have real data.
- **A)** Supabase SQL Editor:
  `DELETE FROM public.expenses; DELETE FROM public.group_members; DELETE FROM public.groups;`
- **B)** Each user: Profile -> Logout -> sign in with Google (clears stale "Guest" local state).
- **C)** Create a group, add friends BY NAME (not yourself), share invite link; each friend
  opens link -> signs in with Google -> claims their name.
- **D)** 2-person end-to-end test: friend lands as their nickname, sees expenses, live-sync
  both ways, survives a refresh. If something breaks, suspect the RLS rules first (recently on).

## Key files
- `src/hooks/useSupabaseSync.ts` — cloud sync engine (gated on real session via userEmail)
- `src/App.tsx` — auth (onAuthStateChange/getSession ~L659), `me` identity (~L145),
  handleDeleteGroup, requireSignInToCreate, invite-claim handler (~L2219)
- `src/components/` — Login.tsx, FloatingAddMenu.tsx, GroupDetail.tsx, MobileHeader.tsx, Profile.tsx
- `api/supabase_setup.sql` — DB schema + Row Level Security setup

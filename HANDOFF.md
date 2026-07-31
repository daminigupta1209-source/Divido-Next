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
  now parallelizes fetches via Promise.all.
- `src/App.tsx` — auth (onAuthStateChange/getSession), `me` identity, handleDeleteGroup,
  invite-claim/rejoin handler, onRemoveMember (sets `Name (Left)`), delete-group-for-me.
- `src/components/` — Login.tsx, MobileHeader.tsx (past-member dropdown), Profile.tsx,
  group-detail/GroupMemberList.tsx (Leave/Delete prompts, member list identity).
- `vite.config.ts` — manual code-splitting config.
- `api/supabase_setup.sql` — DB schema + Row Level Security setup.
- `tests/e2e/` — leave-rejoin, realtime-sync, auth-gating, past-member-ui specs.

# Divido — Session Handoff

_Last updated: 2026-08-14_

## Project basics
- React + Vite + TypeScript PWA for splitting expenses.
- **Deploy:** push to `main` → Vercel auto-builds & deploys. After a push, wait ~1–2 min then hard-refresh (Ctrl+Shift+R). PWA service worker may cache an old version — refresh again if needed.
- **Backend:** Supabase (auth via Google sign-in, `groups` / `group_members` / `expenses` tables, plus a `profiles` table and a `person_id` column added this session).
- Verify logged-in flows on a **real account** — the local dev preview can't log in.

## What was done this session (all pushed to `main`)

### UI / UX polish
- **Mobile group header:** replaced the hamburger with a circular group **DP avatar**; moved the back button to the left of the DP; removed the peach header bar app-wide so every screen uses a flat `var(--bg)` background.
- **Group name avatars:** stopped saving the default house emoji — groups with no uploaded photo now show **name initials** everywhere.
- **Activities/Balances tabs:** now an underline-style tab bar with a sliding **orange indicator**, plus **swipe left/right** to toggle (touch gesture in `GroupDetail.tsx`).
- **Bottom nav:** inside a group, "Activities" becomes **"Photos"** (opens the group gallery). Removed the gallery icon from the activities funnel row. **Friends** tab now uses a **handshake** icon (Lucide) to differ from Groups.
- **Notifications:** the home bell and the group updates-log now open as **full-screen** views (not cramped dropdowns). Notification rows use clean **line-icon badges** (no emojis) and show exact clock time (e.g. `6d ago · 2:30 PM`).
- **Expense editor:** attachment paperclip moved from the header to a **floating green square** button above Save; added a **red delete icon** left of the top-right tick (only for already-created activities); removed the redundant ⋮ menu from expense cards.
- **Undo toast:** redesigned as a clean white card with a green **depleting countdown bar** (6s).
- **Scrollbars hidden app-wide** (scroll still works).
- **+Friend / Rejoin buttons:** orange filled pills, white text.
- **Past-member banner:** compact pill chip; link-request & budget banners slimmed down.
- **Currency picker search:** icon aligned with text via flex row.
- **Group share icon:** now opens the phone's **native share sheet** directly (in-app popup only as desktop fallback).

### Edit Group card (settings vs members)
- Edit Group is **settings + read-only member list** (each name tagged Admin / Joined / Pending / Left) with a single **"Manage members →"** button that returns to the group and auto-opens the members card (via `sessionStorage['divido_open_members']`, handled in `useGroupDetailForm.ts`). Create mode keeps the editable add-list. All member actions live on the group members card (the hub).

### Profile sync (cross-device)
- Profile (name, UPI, currency, photo, budgets) now syncs via a Supabase **`profiles`** table keyed to the auth user id (`App.tsx` `loadProfileFromSupabase` + a debounced save effect). Previously local-only, causing phone/desktop mismatches. **SQL already run.**

### Person-identity feature (stop same-named people merging) — COMPLETE, user testing
See `.claude` memory `divido-person-identity.md` for detail. Summary:
- **Rule:** identity = **email** (signed-in) → else **`person_id`** → else **name** (legacy fallback, so existing data is unchanged).
- `group_members.person_id` column added (**SQL already run**). New name-only members get a fresh `person_id`; signed-in members use email.
- Settle-All (`FriendsView.tsx`) buckets by identity; shows a group label + distinct color only for duplicate names.
- **"Same person / Different?"** prompt (`App.tsx`) fires when adding a name that already exists elsewhere; "Same" links via `localStorage['divido_person_link']` which the sync insert consumes; "Which one?" list when 2+ candidates.
- Reverse case (3 different "Pooja" inviters) auto-separates by email — no prompt.

### Performance, leave-group & duplicates (Claude Code session, same day)
_Separate Claude Code session — all pushed to `main`. Touches `useSupabaseSync.ts`/`App.tsx` too, so pull latest before editing those._
- **Faster first load (`b6cea4e`):** Google Fonts no longer block first paint (`preload` + `media="print"` onload-swap, `<noscript>` fallback). Removed a dead `qrcode` import from `App.tsx` and lazy-loaded `UPIQRModal` + `NetReceivableModal` so the `qrcode` lib leaves the main bundle (loads only when a QR/payment popup opens). Main entry chunk 100.75 kB → 86.63 kB gzip (~14% smaller).
- **Leave group keeps you inside (`3168d80`):** leaving a group no longer bounces you to the groups list when the group lives on as history — you stay on it and see the "You left this group. Showing past history." banner + Rejoin. Only navigates away when the group is actually gone (standalone clear, or delete with no members left). Applied to both the "Leave Group?" menu action and self-removal via the member list (`onRemoveMember`); removing someone else as admin is unchanged.
- **Duplicate-group prevention + auto-heal (`d6ba8fe`):** the type-time name check in `CreateGroupView` only sees this device's in-memory list, so it can't catch a twin made by a slow-network sync retry or a second device. Added (1) a **save-time guard** — before inserting a new group, adopt an existing same-named cloud group the user already belongs to instead of inserting a twin; and (2) a **load-time self-heal** in `useSupabaseSync.ts` that collapses duplicate same-named groups (never deletes a group with expenses, always keeps ≥1 per name — only empty twins go). Added `api/dedupe_groups.sql` for one-time manual cleanup.
- **Compact dates (`8aeae7d`):** shared `formatDate` (`lib/utils.ts`) now renders `13 Aug 26'` (2-digit year + apostrophe) everywhere.

## Still to verify (on a real account)
1. Person-identity: add a duplicate name → prompt appears; Same merges, Different separates in Settle-All.
2. "Manage members →" from Edit Group lands on the group with the members card open.
3. Native share sheet opens from the group share icon on a phone.
4. Profile edits on one device appear on another.
5. Leaving a 2+ member group stays on the group with the "You left…" banner (not bounced to the list).
6. Duplicate same-named groups auto-collapse on load (owner's empty "parel"/"Kota" twins should disappear).

## Key files
- `src/App.tsx` — top-level state, auth, add-friend + same-person prompt, profile sync, share.
- `src/hooks/useSupabaseSync.ts` — DB load/insert, `person_id` assignment, identity read.
- `src/components/FriendsView.tsx` — Settle-All identity bucketing.
- `src/components/CreateGroupView.tsx` — Edit/Create group card.
- `src/components/group-detail/` — GroupDetail, ExpenseList, ExpenseRow, GroupMemberList (the members hub).
- `src/components/MobileHeader.tsx` — mobile header, notifications, updates log.
- `src/lib/utils.ts` — shared helpers incl. `formatDate` (compact `13 Aug 26'` format).
- `api/dedupe_groups.sql` — one-time manual cleanup for duplicate same-named groups (inspect, then delete by id).

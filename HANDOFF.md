# Divido — Session Handoff

_Last updated: 2026-08-18_

## Project basics
- React + Vite + TypeScript PWA for splitting expenses.
- **Deploy:** push to `main` → Vercel auto-builds & deploys (~1–2 min).
- **Build check:** always run `npm run build` (`tsc -b && vite build`) before pushing — NOT just `tsc --noEmit`. A failed `tsc -b` makes Vercel keep the OLD version live (silent). This bit us this session.
- **PWA cache:** the service worker (`public/sw.js`) now **auto-reloads on a new deploy** (`src/main.tsx` reloads on `controllerchange`), so updates apply on the first reopen. `main.tsx` logs a build marker to the console (`[Divido] build …`) — use it to confirm which build is loaded. If a user reports a fix "not working", suspect stale cache first: hard-refresh / DevTools → Application → Clear site data / fully reopen the PWA.
- **Backend:** Supabase (Google sign-in; `groups` / `group_members` / `expenses` / `profiles` tables; `group_members.person_id` for identity). RLS is ON for all three data tables (`expenses` read allowed to members).
- **Testing past the login wall:** in the local preview, inject a guest session + data via localStorage (no cloud wipe). See `.claude` memory `divido-testing-and-cache.md` for the exact snippet — this let us reproduce & verify logged-in flows.

## Session 2026-08-18 (all pushed to `main`)

### Bottom nav + entry points
- **Center nav button is now "Add Expense" everywhere** (green +), same action on home and inside a group. Removed the shape-shifting Group/Upload center button and the floating Scan/+Expense pills (deleted `FloatingAddMenu.tsx`).
- **"+ Group"**: floating orange pill on the home screen (bottom-right).
- **Scan icon** added to the home header (between search and notifications) → opens the scanner.
- **Floating Scan button inside a group**: squarish, orange, with an animated soft-fade scan line.

### Scanner (`BillScanner.tsx`, `useExpenseForm.ts`)
- Gemini key now read from `localStorage['divido_gemini_api_key']` or `VITE_GEMINI_API_KEY` (removed the invalid hard-coded `AQ.` token that was causing 401s). **User must set `VITE_GEMINI_API_KEY` in Vercel** for AI scan.
- Fixed scan results not applying: a stale-closure "close modal if empty" check discarded them (`scanJustCompletedRef` in `ExpenseModal.tsx`).
- Faster scans: downscale image before upload + model `gemini-2.5-flash-lite`.
- **Low-memory crash fix:** full-res camera photos crashed lower-RAM phones. New `src/lib/imageUtils.ts` `downscaleImageFile()` (uses `createImageBitmap`, memory-safe) is used by the scanner and by attachment capture.
- Scanner still opens the in-app live camera (user preferred the original). Native-camera route was tried and reverted per request.

### Expense create/edit (`useExpenseForm.ts`, `ExpenseModal.tsx`)
- **New expenses now save** — the nav handler was creating drafts with `id: null`; now uses a `temp-` id like the other entry points (id:null made saves silently no-op).
- Button label: "Record Expense" for new, "Save Changes" for existing.
- **Paid For**: all group members auto-selected by default for a new expense; added a **select-all checkbox** next to the "Paid For" label.
- Fixed new-expense "Unequally" split being wiped when the total was entered; hid the delete/trash icon for unsaved (temp) expenses.

### Balances / settle
- **Hyphenated names** ("Jean-Paul") balance fix — pair keys now use the `\x1f` delimiter in `App.tsx` and `SettleModal.tsx` (matches `calculations.ts`).
- **Settle view is now full-screen** and scrollable (pinned ✕), so the keyboard doesn't hide content.
- Net Balance card also shows on the **Settle tab** (not just Activities).
- Net balance colors darkened/brightened: green `#10B981`, pink `#DB2777`.
- Per-row **direction labels**: "You are Paying" (pink) / "You are Collecting" (green), so a mixed net reads correctly.
- **Settle amount box:** capped at the owed max with a **shake** (whole box shakes so the ₹ stays); rewritten as an **uncontrolled input** (`SettleAmountInput` in `App.tsx`) for reliable caret.
- **Settle reminder** now opens the phone's **native share sheet** (with a UPI pay link for INR); desktop falls back to the in-app card.
- **Focus-steal bug fixed (`useAppHotkeys.ts`):** the popup's auto-focus effect had `localSettleEdits` in its deps, so every keystroke re-focused the FIRST box (backspace jumped to box 1). Auto-focus now runs only when the popup opens (deps `[globalSettleData]`); arrow-key nav is a separate effect. Diagnosed via a temporary on-screen event log (since removed).

### Identity (same-named people) — settle correctness
- **Different people, same name** (two "didi" in different groups): settle now restricts to the tapped person's own groups (`globalSettleData.groups`), so they don't merge.
- **Merged person across groups:** settle resolves the member name **per group** from the identity, so all their groups are included (fixed a case where a group was dropped).
- The "same person / different?" prompt on add (`App.tsx` `findPersonCandidates` / `resolvePersonChoice`, and the sync `MatchPromptModal`) was reviewed and is intact.

### Sharing / sync / login
- **Invitee saw an empty group:** the "skip cloud load while unsynced" guard treated a just-joined group as unsynced and never fetched its expenses. Real-DB-id groups absent from the last-synced snapshot are now excluded from that check (they load). Also: a transient empty membership result no longer wipes already-loaded groups.
- **OAuth login loop fixed:** `signInWithOAuth` used `redirectTo: window.location.href`, re-feeding stale `?error…#access_token…` and causing `bad_oauth_state`. Now redirects to a clean origin+path (keeps only `joinGroupId`).
- Stopped the `profiles` write firing on the sign-in page (401/RLS console noise) — gated on `isAuthenticated`.
- **Fresh-login UX:** brief **cat splash** (`/divido_laughing_cat_mascot_*.png`) instead of an empty "Your Groups" while the first cloud load runs (5s safety timeout). (A "Syncing…" loader and skeletons were tried; splash is the current choice.)

### Cleanups
- **Name changes no longer post a ₹0 "X is now Y" activity** (notification only). Legacy "is now" and "X rejoined" ₹0 rows are filtered out of local cache + sync (`isLegacyRenameLog` in `lib/utils.ts`) and were deleted from the DB.
- **Profile rename is account-only** (Option 3): it no longer reaches into groups, so it can't overwrite a custom per-group name or leave ghosts. Your name inside a group comes from that group's member row.
- Sign-in page: removed the long PWA install hint. New Group card color iterations ended as the floating orange pill.

### Balances note
- A "Denmark ₹450 → ₹383.33" question was **not a bug**: it's the correct net given the current expenses (two "Billo" ₹100 entries reduced it). Possible accidental duplicate Billo (ids 726 & 728) — user to decide whether to delete.

## Prior session (2026-08-14) — summary
UI polish (group DP avatar header, initials avatars, sliding tab indicator + swipe, Photos tab, handshake Friends icon, full-screen notifications, floating attachment button, undo countdown toast, hidden scrollbars), Edit Group = settings + read-only members with "Manage members →", cross-device **profile sync** via `profiles` table, the **person-identity** feature (email → person_id → name; `person_id` column; Settle-All bucketing; same-person prompt), and a Claude Code sub-session: faster first load (font preload, lazy QR modals), leave-group-stays-inside, duplicate-group prevention + auto-heal (`api/dedupe_groups.sql`), compact `formatDate`. **SQL for `profiles` and `person_id` already run.**

## Planned next (not started)
- **Native app (Capacitor)** for an Instagram-style full-screen camera + inline photo-gallery picker — a web app can't do that grid; the web in-app camera quality is poor. Targeted ~2026-08-18+. See `.claude` memory `divido-native-camera-plan.md`.
- Optional: lock the Gemini API key in Google Cloud (restrict to Generative Language API + app referrer) since a `VITE_` key ships in the browser.

## Still to verify (on a real account, fresh build)
1. Settle amount boxes edit smoothly & independently (the focus-steal fix — the last big bug).
2. New expense from the center button saves and appears.
3. Scanner works once `VITE_GEMINI_API_KEY` is set in Vercel.
4. Invitee sees the group's expenses (not empty) on first join.
5. Login is smooth (no OAuth loop, cat splash then groups).

## Key files
- `src/App.tsx` — top-level state, auth/OAuth, add-friend + same-person prompt, profile sync, share, the global settle modal + `SettleAmountInput`, floating +Group / scan buttons, cat splash.
- `src/hooks/useSupabaseSync.ts` — DB load/insert, `person_id`, the unsynced-load guard, legacy-log filter, duplicate self-heal.
- `src/hooks/useAppHotkeys.ts` — settle popup focus/keyboard nav (auto-focus only on open).
- `src/hooks/useExpenseForm.ts` — expense form/save/split, member auto-select, handleScanComplete.
- `src/components/expense-modal/BillScanner.tsx` — scanner (Gemini + local OCR), image downscale.
- `src/components/ExpenseModal.tsx` — expense editor, attachment capture, scanner-close guard.
- `src/components/FriendsView.tsx` — Settle-All identity bucketing.
- `src/components/GroupDetail.tsx` — group tabs, net balance card.
- `src/lib/imageUtils.ts` — memory-safe image downscaler.
- `src/lib/utils.ts` — `formatDate`, `isLegacyRenameLog`.
- `public/sw.js` + `src/main.tsx` — service worker (auto-update) + build marker.
- `api/dedupe_groups.sql` — one-time duplicate-group cleanup.

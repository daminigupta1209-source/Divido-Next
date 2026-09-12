# Divido-Next Handoff

## Latest session — Cloud UPI auto-sync, email-anchored (Sep 12 2026)

**Goal:** a friend's UPI ID autofills when you tap Pay — no QR passing. Antigravity built the frontend (push own `upi_id` to `group_members`; download others' into local `userMetadata`; include `upi_id` on invite-join). This session **reviewed + corrected the identity keying** and hardened it.

- **REQUIRED DB step (user runs in Supabase SQL editor):** `ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS upi_id text;` — safe/additive/idempotent. Until run, cloud writes fail silently (console: `Failed to sync UPI ID to cloud`); app still works.
- **Writes are owner-only:** `UpiSection.tsx` pushes your UPI with `.eq('user_email', session.user.email)` (only your own rows); invite-join sets `upi_id` only for `isMe`. No one can write another person's UPI. (Kept as Antigravity wrote it.)
- **Fix — anchor synced UPI on EMAIL, not display name (de46d7b):** Antigravity keyed downloaded UPIs by display name → two same-named people could clobber each other and a payer could autofill the WRONG person's UPI (real money). Now `useSupabaseSync.ts` stores each synced UPI under the owner's **lowercased email** (only members with a real email). New tested helper `upiFor(userMetadata, nameToEmail, name)` in `identity.ts` resolves name→email before reading; falls back to the name key (self / locally-linked) and **refuses to guess** when a name is ambiguous. All pay-facing reads updated: `SettleModal`, `NetPayableModal` (now takes a `groups` prop), QR payee in `App.tsx`, member 💳 badge in `GroupMemberList`. Self reads (`userMetadata[me]`) stay name-keyed/local.
- **Fix — resolve email from the GROUP in settle/QR (555c55b):** a group settle card / QR is inside one group, which already pins the payee's exact email — so resolve via `getPersonKey(selectedGroup, name)` FIRST (unambiguous by construction); `buildNameEmailResolver(groups)` (cross-group) is only the fallback for the global "settle everyone" screen. Prevents a same-named person in another group from blanking a known member's UPI.
- **Tests:** `identity.test.ts` +6 for `upiFor` (76 total, green). `npm run build` green.

**User's two-phone test (after running the SQL + hard-refresh both):** A saves UPI in Profile → `SELECT name,user_email,upi_id FROM group_members WHERE upi_id IS NOT NULL;` shows it → B taps Pay on A → prefilled. If B stays blank AND the SELECT shows no `upi_id`, it's an RLS policy blocking the self-update → needs a policy written.

## Latest session — Balances, identity & currency reliability (Sep 11 2026)

**Context:** People (Abhishek, Chirag, and others) were vanishing from the "All balances" screen. Root cause was an **identity mismatch**, not the parked state-migration. Diagnosed, fixed, and hardened with tests. All pushed to `main`.

- **Root cause of missing people (fixed):** balances resolved a person via `getPersonKey`, but the current user's key was computed from the wrong name form (first-name vs full-name) while the locally-stored `divido_email` was empty — so real members failed to resolve and dropped off the list. Fixes:
  - New tested helpers in `src/lib/identity.ts`: `resolveSelfKey(group, {email, fullName, firstName, claim})` (tries email → fullName → firstName → claim against `memberIdentities`) and `buildNameEmailResolver(groups)` (name → unambiguous email across groups).
  - `App.tsx` now persists `divido_email` on sign-in (both `onAuthStateChange` and `getSession`) and passes `userEmail` to `FriendsView`.
  - `FriendsView.tsx` computes `myKey` per group via `resolveSelfKey`; Non-Group section resolves people via `buildNameEmailResolver` (guarded against self-email); rendered friends via plain `.map()` (removed Virtuoso — it was truncating the list inside the grid on mobile).
  - Regression tests: `src/lib/identity.test.ts` (70 tests total, green).
- **Member email on re-add (fixed, ee6a0aa):** Pending list shows `emailFor(m) || emailAnywhere(m)`; `commitSelected` inherits a known email via `buildNameEmailResolver`, so re-adding a person no longer drops their email.
- **Currency swap card no longer blank (112140e):** cards in `ExpenseRow.tsx` + `ActivityStudio.tsx` fall back to a label ("All currencies ➔ ₹" etc.) when a conversion has no rate chips.
- **Silent 1:1 conversion bug (e12c718):** `CurrencyConverterModal` recorded actual rates used and now **aborts with a warning** if any converted currency lacks a valid rate (previously a missing rate silently converted money at 1:1).
- **Re-conversion rate fetch (301a3a7):** `detectedCurrs` includes original currencies from conversion snapshots, so re-converting fetches the rates it needs.
- **Options sheet reopening (c5e0c75):** overlay-swap `replaceState` branch in `App.tsx` history effect — opening the converter from the group options sheet no longer reopens the sheet on close. Fixes the whole "option → modal" class.

**Open real-data item:** Jaipur's past "ALL → ₹" conversion ran at 1:1 (empty `rates_used`), so its ₹ amounts may equal the raw foreign numbers. Cleanup: **Undo conversion → convert again** (now converts at real rates). User to verify numbers after.

**Parked:** Zustand state-migration (Phase 1 ledgerStore / Phase 2 balanceStore) on branch `wip-state-migration` — retry only after the async-race is understood; it was NOT the cause of the balance bug.

**Rule adopted:** for any balance/identity/sync change, run `npm test` + `npm run build` + two-device check before pushing.

## Current State & Recent Fixes
- **Non-group Add friend = full-screen picker + removable recents (Sep 2026)**: Non-group (STANDALONE) expenses now open the SAME full-screen `FullScreenAddFriend.tsx` as the group flow, instead of the old small centered popup. It runs in a new **single-select** mode (`singleSelect` prop): non-group splits are always you + one other, so tapping a person (or "Add … as new") commits immediately and closes — no green-check confirm, no multi-tick. Wired in `ExpenseModal.tsx` (`showFriendPickerPopup` branch, STANDALONE block) where picking sets `[me, name]`. Suggestions now come from the shared `buildPeopleSuggestions(groups, null, [me], me, myEmail)` (identity.ts), so recents show **emails/identities** exactly like the group screen (replaced the old name-only `allKnownFriends`). Each "Recently split with" row has a **trash icon** to remove that person from suggestions; it persists per-device in `localStorage` under `dividoDismissedPeople` and is filtered inside `buildPeopleSuggestions` (helpers `dismissPerson` / `getDismissedPeople` / `dismissedPersonKey`), so it applies to BOTH group and non-group. Removal never touches groups/expenses/balances. Search + email boxes are **50px** tall / 12px radius, with the input's border/radius/padding/appearance pinned inline so the global `input {}` rule (16px padding, 2px border) can't distort it. Icons: trash 20px grey `#CBD5E1`, `+` 26px, both with `marginRight:8px` off the edge.
- **PWA meta (Sep 2026)**: Added `<meta name="mobile-web-app-capable" content="yes">` alongside the apple- variant in `index.html` to silence the console deprecation warning. (Note: the `[Divido] build 2026-08-20-cache-v3` console line is a stale hardcoded label — NOT the real build date; don't trust it when diagnosing stale versions.)
- **Quick-add hero — voice + scan (Sep 2026)**: The two faint inline mic/scan icons in the title field are gone. The expense add/edit form now opens with a "Quick add" hero bar at the very top of the scroll body (`ExpenseModal.tsx`, before Section 1). Light indigo tint (`#EEF2FF`, `padding:8px 12px`, `borderRadius:12px`); a sparkle + "Quick add" label, with two 30px action buttons on the right — **mic = grey `#94A3B8`**, **scan = light green `#34D399`**, white icons. Three states: resting; active (`isListening`/`isParsingVoice`/`isScanning` → indigo-tint bar with pulsing mic + waveform / spinner + "Listening…/Understanding…/Scanning receipt…", plus a Stop button while listening); and filled (`aiFilledFrom` = `'voice'|'receipt'` → green confirmation "Filled from …" + Redo). `aiFilledFrom` is set after a successful voice parse / `onScanComplete`, and cleared when the user edits title or amount. Scan button keeps `id="expense-scan-btn"`.
- **Notes + date pills (Sep 2026)**: Both moved to bottom-left pills, styled identically to the New Group card's date pill (white, `1.5px var(--border)`, `borderRadius:12px`, `padding:10px 14px`). Notes pill ("Add note") sits directly above the date pill (`7 Sep 26'` format). The date pill uses the native picker via `showPicker()` (same as New Group), replacing the old custom "Pick a Date" popup. The old inline calendar + notes icons in the amount/title rows are removed.
- **Save-tick uniformity (Sep 2026)**: The expense add/edit modal no longer has a bottom "Record Expense / Save Changes" button. The single save control is the green header tick, styled to match the "Group Members" / "New Group" headers exactly (`#15803D`, 24px, strokeWidth 3.5, header `paddingRight: 20px`, button `padding: 6px`). It keeps the `id="save-expense-btn"` so keyboard nav/focus fallbacks in `useExpenseForm.ts` still resolve.
- **Dismissible title suggestions (Sep 2026)**: The expense title dropdown suggestions each have an ✕ to remove them. Dismissals persist in `localStorage` under `dividoDismissedSuggestions` (per-device, not cloud-synced). Logic in `useExpenseForm.ts` (`dismissSuggestion`, `dismissedSuggs`, `filteredSuggs`); UI in `ExpenseModal.tsx`.
- **Month-heading unification (Sep 2026)**: All activity lists (home Activities, group detail, Non-Group) share one plain-gray month heading style: `{ fontSize:'11px', fontWeight:700, letterSpacing:'0.5px', color:'#94A3B8', margin:'8px 2px 0' }`. Rows show "6 Sep" (no year); the month heading carries the year ("Sep 2026").
- **UI Interaction Paradigm**: We have completely removed all 3-dots menus globally. The app strictly uses **long-press** gestures to reveal context/action menus (implemented in `ActivityStudio` and `ExpenseRow`). Long-press ignores multi-finger touches (2-finger screenshot swipe no longer opens the menu).
- **Soft Delete / Undo**: Added soft delete infrastructure (using `isDeleted`) so users can "Undo Payment" or "Restore Payment" without permanently wiping the DB record immediately.
- **Navigation Fixes**: 
  - Fixed a history stack issue where swiping back from a group broke the app. Tapping a group card from the home screen now explicitly resets the group tab state to `'expenses'`.
  - Fixed "Settle up" flow inside the "Leave Group" screen to route correctly to the balances tab.
- **UI/Layout Polish**:
  - `MobileHeader.tsx`: Added `text-overflow: ellipsis` and right-bounds to prevent long group names from colliding with the top-right icons.
  - `FriendsView.tsx`: Cards were overflowing on narrow mobile screens. Fixed by using a responsive `minmax(min(100%, 340px), 1fr)` grid layout.
  - `FriendsView.tsx`: Duplicate name resolution added. Email IDs and Group names only show up if the person has a duplicate name in the friends list. Group name appears to the right in parenthesis, email appears below.
  - `ActivityStudio.tsx`: Fixed asymmetrical padding (`24px` right vs `16px` left) and removed ghost flex gaps that were causing the amounts to float awkwardly far from the right edge.
- **UPI ID Polish & Cloud Sync (Sep 2026)**: 
  - *UI Adjustments*: Dynamically scaled the font size inside the UPI ID input (`UpiSection.tsx`) so that very long IDs remain fully visible without horizontal clipping. Adjusted the padding and nudged the "Verify" button to align perfectly with the text baseline.
  - *Cloud Sync (Pending SQL)*: Implemented auto-syncing of UPI IDs to the cloud. `UpiSection.tsx` pushes the UPI ID to the `group_members` table on save, and `useSupabaseSync.ts` automatically downloads and merges friends' UPI IDs into local `userMetadata` so they appear instantly on the 'Pay' screen. **Requires user to run `ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS upi_id text;` in Supabase.**

## Outstanding Tasks (To Do)
1. **Conceptual sharing model investigation**: Understand and refine how non-group (peer-to-peer) expenses function.
2. **Two-phone sync testing**: Verify UI hardening and sync logic on real devices.
3. **Retention**: Add a small game for user retention.
4. **(Optional) Cloud-sync dismissed items**: `dividoDismissedSuggestions` (title suggestions) and `dividoDismissedPeople` (recents in Add friend) are both localStorage-only; move to the cloud profile if cross-device sync is wanted.

### Done since last handoff
- Identity-reuse extended to the create-group screen (suggestions + emails).
- Past Members: "Left" history + re-invite/pending-invite editing (name+email popup) shipped.
- Write-offs routed through the canonical identity/balance engine.

## User Preferences & Important Guidelines
- **Terminology**: Always use "Pay"/"Collect". Do not use "Owe"/"Owed".
- **Emojis**: Absolutely NO emojis in leave/remove/write-off cards or action menus.
- **Inputs**: Android inputs must use `type="search"`.
- **UI Alignment**: The user is highly detail-oriented about padding, margins, and flexbox alignment. Always ensure spacing is symmetrical and mathematically balanced. New controls should match existing equivalents pixel-for-pixel (color, size, stroke, position) for uniformity.
- **Dates**: Rows show "6 Sep" (no year); month section headings carry the year, title-cased ("Sep 2026").
- **Labels**: "Payment Recorded" → "Settlement"; "Currency Conversion" → "Currency swap".
- **Build discipline**: Run `npm run build` (`tsc -b && vite build && stamp-sw`) and check the real exit code — piping to `tail` masks tsc failures. A failed build silently keeps the old Vercel version live. Push straight to `main` (Vercel auto-deploys); remind the user to hard-refresh once for the new service worker.

## Codebase Notes
- **Action UI**: Context menus are managed via an `openExpId` state and use `position: absolute`.
- **History Management**: The app uses native `window.history.pushState` for tracking UI snapshots. Changes to views (like opening a group) require carefully managing states (e.g. `setGroupDetailTab`) to ensure the back gesture behaves predictably.

# Divido-Next Handoff

## Current State & Recent Fixes
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

## Outstanding Tasks (To Do)
1. **Conceptual sharing model investigation**: Understand and refine how non-group (peer-to-peer) expenses function.
2. **Two-phone sync testing**: Verify UI hardening and sync logic on real devices.
3. **Retention**: Add a small game for user retention.
4. **(Optional) Cloud-sync dismissed suggestions**: Currently `dividoDismissedSuggestions` is localStorage-only; move to the cloud profile if cross-device sync is wanted.

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

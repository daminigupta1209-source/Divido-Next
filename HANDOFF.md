# Divido-Next Handoff

## Current State & Recent Fixes
- **UI Interaction Paradigm**: We have completely removed all 3-dots menus globally. The app strictly uses **long-press** gestures to reveal context/action menus (implemented in `ActivityStudio` and `ExpenseRow`).
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
3. **Identity-reuse**: Extend this to the create-group screen.
4. **Past Members**: Implement lightweight "Left" history and a "Re-invite" flow.
5. **Write-offs**: Route `performWriteOff` through `iden`.
6. **Retention**: Add a small game for user retention.

## User Preferences & Important Guidelines
- **Terminology**: Always use "Pay"/"Collect". Do not use "Owe"/"Owed".
- **Emojis**: Absolutely NO emojis in leave/remove/write-off cards or action menus.
- **Inputs**: Android inputs must use `type="search"`.
- **UI Alignment**: The user is highly detail-oriented about padding, margins, and flexbox alignment. Always ensure spacing is symmetrical and mathematically balanced.

## Codebase Notes
- **Action UI**: Context menus are managed via an `openExpId` state and use `position: absolute`.
- **History Management**: The app uses native `window.history.pushState` for tracking UI snapshots. Changes to views (like opening a group) require carefully managing states (e.g. `setGroupDetailTab`) to ensure the back gesture behaves predictably.

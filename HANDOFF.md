# Divido-Next — Handoff / Context

> Resume prompt: **"Read HANDOFF.md and continue with the Leave/Rejoin flow debug."**

## Status Update — July 30, 2026

We are currently debugging the final failing E2E test case: `Removing and rejoining user should work seamlessly via Rejoin links` in `tests/e2e/leave-rejoin.spec.ts`. 

### ✅ What we completed
1. **Sync Deadlock Fixed**: Fixed the sync load-gating skips on page reload by mapping the correct `divido_groups` and `divido_expenses` storage keys as fallbacks in `useSupabaseSync.ts` (was using stale placeholder keys).
2. **Sync Renaming Duplicates Resolved**: Prevented left members (`Name (Left)`) from being inserted as duplicate rows in `useSupabaseSync.ts`'s push diff.
3. **Robust Click Target**: Replaced flakey clicks on the small remove member button `✕` with reliable locator-based clicks and tactical page reloads/group clicks in the E2E tests.
4. **Restored Lost Usernames**: Ensured Page B's localStorage keeps `"divido_username": "Husky"` so the app identifies the user correctly on navigation.
5. **Admin Approval spec passing cleanly**: Test case 3 (admin approval/decline modals) is now fully green.

---

### 🚨 Current Blocking Issue (Test Case 2)
In the first leave-rejoin test, Page B (Husky) lands on the rejoin link (`/?joinGroupId=...&rejoinName=Husky`) but the Rejoin modal does not appear, causing the test to time out.
* **Why**: The rejoin URL parser in `App.tsx` expects to find a row in the database with the name `"Husky (Left)"`. However, the row still has the name `"Husky"`.
* **Root Cause**: Page A's remove action query (updating `name` to `Husky (Left)`) silently failed to modify the row in the database, despite returning status code `204` (No Content).

---

### 🛠️ Diagnostic Steps Applied (Ready for next run)
We have just updated `onRemoveMember` in `App.tsx` (~L2034) to:
1. Perform a `select` query first to fetch the target member row matching the group and name.
2. Log the output (`[DEBUG] Found member rows: ...`).
3. If found, update the row directly by its unique `id` rather than using group-name filters.
4. Log the update result (`[DEBUG] Supabase update by ID result: ...`).

---

### 📋 Next Steps for Claude Code
1. **Run the test suite**: Execute `npx playwright test` to see if the new select-and-update by ID succeeded, or inspect the logs if it still failed.
2. **Inspect the terminal output / logs**:
   * Look for `[DEBUG] Found member rows:` to see if the select matched any rows.
   * If the select returns empty (`[]`), check if there is an issue with how `selectedId` (string vs number) or `memberName` are parsed.
3. **Verify clean pass**: Run the full suite to verify all 5 specs are green before making a clean commit and push.

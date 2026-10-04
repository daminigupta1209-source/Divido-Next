# Permanent ID project: expenses point at people by ID, not by name

Status: PLANNED (2026-10-04). Not started.

## Goal

Every expense records **who paid / who shared** by the member's permanent ID
(`group_members.member_key`) instead of by name.

When it's done:
- Two people in one group can have exactly the same name. The hidden
  "Esha Gupta (esha1997)" tag is no longer needed.
- Renaming someone changes one row (their member record). Today it rewrites
  every expense in the group, through the `rename_member` SQL function.
- Names on expenses become display text only. They can't break balances any more.

## Where we are today

- `group_members.member_key`: a permanent ID per member row. It never changes,
  through claim, rename, leave/rejoin or an email edit. **Done.**
- `expenses.party_keys`: a jsonb map `{ "name as written": member_key }`, filled
  on every expense, old ones backfilled. **Done.**
- Balances already resolve people via `party_keys` (`toIdentitySpace`), so money
  math is ID-based. **Done.**
- Still name-based: `expenses.paid`, `expenses.splitters`, the keys of
  `expenses.shares` / `origShares`, and every screen that reads them. About 90
  places across 23 files (expense rows, pickers, analytics, export, gallery,
  settle, activity feed, Splitwise import, notifications).

## Plan (5 steps, each released and checked on its own)

### Step 1: Database: ID columns next to the names
New SQL file `api/expense_member_ids.sql`, which the user runs in Supabase:
- `expenses.paid_key text`, `expenses.splitter_keys text[]`, `expenses.shares_by_key jsonb`.
- Backfill them from `party_keys` for every existing expense.
- A **database trigger** that fills them from `party_keys` / names whenever a row
  arrives without them. This protects against phones still running an old app
  version during the switch.
- A coverage check query: rows with any missing key, which must be zero before step 3.

### Step 2: App writes both (dual-write)
- Adding or editing an expense saves the names (as now) **and** the IDs.
- Nothing visible changes. This is a safe release on its own.

### Step 3: App reads the IDs
- One helper, `personOf(group, key)` → current name, email, avatar from the roster.
  Every screen shows people through it, so a renamed person shows their new name
  on old expenses too.
- Pickers (Paid by / Split with) work on IDs. The label stays "Name" or
  "Name · email" when two names clash (`pickerLabel`).
- Balances: switch `toIdentitySpace` from `party_keys` to the new columns
  (small change, same engine).
- Go through all ~90 name reads file by file. Tests are added per area
  (balances, settle, analytics, export).

### Step 4: Drop the tag and simplify renames
- Adding, joining or renaming no longer adds "(emailpart)". New members keep
  exactly the typed name.
- Rename = update the member row only. `rename_member` no longer rewrites expenses.
- Existing tagged names: one SQL clean-up strips the tag from `group_members.name`.
  Expenses are unaffected because they now use IDs.

### Step 5: Clean-up
- Remove the name-matching fallbacks that are now unused (`getPersonKey` name
  paths, `withoutEmailTag`, `uniqueProfileName`) once nothing reads them.
- Keep `paid` / `splitters` names in the database as a readable snapshot (handy
  for exports and debugging), but nothing calculates from them.

## Out of scope

- **Non-Group (STANDALONE) expenses**: these have no member rows, so there's no
  member_key. They stay name-based for now and get IDs as part of the separate
  "Non-Group in the cloud" work.

## Risks and how we handle them

| Risk | Handling |
|---|---|
| Phones on an old version write name-only expenses mid-switch | The DB trigger (step 1) fills the IDs on every insert/update |
| A screen missed in step 3 shows the wrong / old name | Names stay stored, so a missed spot shows the old name and never wrong money. A search for `.paid` / `.splitters` must come back clean before step 4 |
| Balances change after the switch | Before/after comparison of every group's balances on real data; must be identical |
| Brother's branch touches the same files | Agree who owns which files during steps 3–4; merge often |
| Release churn → white screens | Each step is one release, done at a quiet time (see release cadence) |

## Testing

- Unit tests: ID-based balances equal name-based balances for the same data,
  including two same-named members in one group, a rename and a leave/rejoin.
- A one-off script compares every group's balances before and after on real data.
- Phone check after each step: Home, a group, All balances, settle, add/edit expense.

## Effort

About 2 working days in total: step 1 (½ day), step 2 (½ day), step 3 (1 day,
the bulk), steps 4–5 (a few hours). Five separate releases.

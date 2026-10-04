-- One active seat per email per group.
--
-- A sync race let a member who renamed themselves be re-inserted under their
-- old name, so the same account ended up with two (or three) active rows in a
-- group. The app now guards against that, but older installs and any future
-- code path still could. This index makes the database refuse it outright.
--
-- Scope: only rows with a user_email (joined / claimed) that aren't a past
-- "(Left)" spot. Past spots keep their email for history and may coexist with
-- the person's active row; pending invites (invite_email only) aren't covered.
--
-- Run AFTER cleaning existing duplicates: creating the index fails while any
-- group still has two active rows with the same email. Safe to run more than
-- once.

-- ── 1. Check: must return 0 rows before step 2 ────────────────────────────
SELECT group_id, lower(user_email) AS email, count(*) AS active_rows,
       array_agg(id ORDER BY id) AS ids, array_agg(name ORDER BY id) AS names
FROM public.group_members
WHERE user_email IS NOT NULL AND name NOT ILIKE '% (Left)'
GROUP BY group_id, lower(user_email)
HAVING count(*) > 1;

-- ── 2. The index ──────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS group_members_one_email_per_group
  ON public.group_members (group_id, lower(user_email))
  WHERE user_email IS NOT NULL AND name NOT ILIKE '% (Left)';

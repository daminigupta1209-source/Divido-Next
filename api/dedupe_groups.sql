-- Clean up duplicate groups (e.g. two "parel" groups showing in the list).
--
-- A duplicate is two separate rows in `groups` with the same name that you're
-- a member of. The app only auto-merges same-named groups when their member
-- lists match exactly, so a small difference leaves both showing.
--
-- Run these ONE AT A TIME in the Supabase SQL Editor. Read step 1 before
-- deleting anything — you decide which row to remove.
--
-- Replace the email below with the Google account you sign into Divido with.

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 1 — INSPECT: list your groups with how many members and expenses each
-- has. Duplicates appear as two rows with the same name. The one to KEEP is
-- usually the one with more members / more expenses; the empty copy is the
-- stray. Note the `id` of the row you want to delete.
-- ───────────────────────────────────────────────────────────────────────────
select
  g.id,
  g.name,
  (select count(*) from group_members m where m.group_id = g.id) as members,
  (select count(*) from expenses e      where e.group_id = g.id) as expenses,
  g.created_date
from groups g
where g.id in (
  select group_id
  from group_members
  where lower(user_email) = lower('YOUR_EMAIL_HERE')
)
order by g.name, g.id;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 2 — DELETE the stray copy. Put the id you chose from STEP 1 in place of
-- 123 in all three lines, then run them together. Order matters: remove the
-- child rows (members, expenses) before the group itself.
--
-- SAFETY: the middle line should report "0 rows" if you picked the empty copy.
-- If it deletes expenses, you picked the wrong (real) group — STOP and restore.
-- ───────────────────────────────────────────────────────────────────────────
-- delete from group_members where group_id = 123;
-- delete from expenses      where group_id = 123;
-- delete from groups        where id       = 123;

-- ───────────────────────────────────────────────────────────────────────────
-- OPTIONAL — automatic version: deletes ONLY empty groups (zero expenses) that
-- have a same-named sibling WITH expenses that you also belong to. This never
-- touches a group that holds any expenses, and never fires when both copies
-- are empty (then use STEP 2 by hand). Run the SELECT first to preview, then
-- uncomment the two deletes.
-- ───────────────────────────────────────────────────────────────────────────
-- with mine as (
--   select distinct group_id
--   from group_members
--   where lower(user_email) = lower('YOUR_EMAIL_HERE')
-- ),
-- counts as (
--   select g.id, g.name,
--          (select count(*) from expenses e where e.group_id = g.id) as exp_count
--   from groups g
--   where g.id in (select group_id from mine)
-- ),
-- strays as (
--   select c.id
--   from counts c
--   where c.exp_count = 0
--     and exists (
--       select 1 from counts c2
--       where lower(c2.name) = lower(c.name)
--         and c2.id <> c.id
--         and c2.exp_count > 0
--     )
-- )
-- select * from strays;   -- preview which ids would be removed
--
-- -- then, once you're happy with the preview:
-- -- delete from group_members where group_id in (select id from strays);
-- -- delete from groups        where id       in (select id from strays);

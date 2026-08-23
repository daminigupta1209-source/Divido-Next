-- Divido — Stage 1: permanent group IDs
-- Migrates group ids from database-assigned numbers to client-generated
-- permanent text (UUID) ids, and does a FRESH RESET of test data.
--
-- Run this in the Supabase SQL Editor BEFORE the new app version goes live.
-- (Paste the whole thing, press Run.)

-- 1. Fresh reset: wipe existing test groups/members/expenses.
TRUNCATE public.expenses, public.group_members, public.groups RESTART IDENTITY CASCADE;

-- 2. Drop the foreign keys that point at groups.id so we can change its type.
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_group_id_fkey;
ALTER TABLE public.expenses      DROP CONSTRAINT IF EXISTS expenses_group_id_fkey;

-- 3. Change the id / group_id columns from number (bigint) to text.
ALTER TABLE public.groups ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE public.groups ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.groups ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.group_members ALTER COLUMN group_id TYPE text USING group_id::text;
ALTER TABLE public.expenses      ALTER COLUMN group_id TYPE text USING group_id::text;

-- 4. Recreate the foreign keys (now text -> text).
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

-- Done. groups.id, group_members.group_id and expenses.group_id are now text,
-- ready for permanent client-generated ids. RLS policies and indexes on these
-- columns keep working (text = text comparisons).

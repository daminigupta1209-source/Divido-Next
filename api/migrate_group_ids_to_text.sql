-- Divido — Stage 1: permanent group IDs
-- Migrates group ids from database-assigned numbers to client-generated
-- permanent text (UUID) ids, and does a FRESH RESET of test data.
--
-- Run this in the Supabase SQL Editor BEFORE the new app version goes live.
-- (Paste the whole thing, press Run.)

-- 0. Drop every RLS policy on the three tables. Postgres refuses to change a
--    column's type while a policy references it, so we drop them all now and
--    recreate them at the end (step 5). Dynamic so nothing is missed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('groups', 'group_members', 'expenses')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 1. Fresh reset: wipe existing test groups/members/expenses.
TRUNCATE public.expenses, public.group_members, public.groups RESTART IDENTITY CASCADE;

-- 2. Drop the foreign keys that point at groups.id.
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

-- 5. Recreate all RLS policies (identical to the app's existing ones).

-- 5a. groups
CREATE POLICY "Allow authenticated users to create groups"
ON public.groups FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow members to read/write their groups"
ON public.groups FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = groups.id
      AND group_members.user_email = auth.jwt() ->> 'email'
  )
  OR auth.role() = 'authenticated'
);

-- 5b. group_members
CREATE POLICY "Allow authenticated users to read member list"
ON public.group_members FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Allow members or creators to insert group members"
ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members EXISTING
    WHERE EXISTING.group_id = group_members.group_id
      AND EXISTING.user_email = auth.jwt() ->> 'email'
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.group_members EXISTING
    WHERE EXISTING.group_id = group_members.group_id
  )
);

CREATE POLICY "Allow updating member details"
ON public.group_members FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members EXISTING
    WHERE EXISTING.group_id = group_members.group_id
      AND EXISTING.user_email = auth.jwt() ->> 'email'
  )
  OR user_email IS NULL
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members EXISTING
    WHERE EXISTING.group_id = group_members.group_id
      AND EXISTING.user_email = auth.jwt() ->> 'email'
  )
  OR user_email = auth.jwt() ->> 'email'
);

CREATE POLICY "Allow members to delete group members"
ON public.group_members FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members EXISTING
    WHERE EXISTING.group_id = group_members.group_id
      AND EXISTING.user_email = auth.jwt() ->> 'email'
  )
);

-- 5c. expenses (read = any member incl. removed; write = active members only)
CREATE POLICY "Members can read group expenses"
ON public.expenses FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "Active members can add expenses"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_email = auth.jwt() ->> 'email'
      AND gm.name NOT ILIKE '% (Left)'
  )
);

CREATE POLICY "Active members can edit expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_email = auth.jwt() ->> 'email'
      AND gm.name NOT ILIKE '% (Left)'
  )
);

CREATE POLICY "Active members can delete expenses"
ON public.expenses FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_email = auth.jwt() ->> 'email'
      AND gm.name NOT ILIKE '% (Left)'
  )
);

-- Done. Group ids are now text; RLS restored.

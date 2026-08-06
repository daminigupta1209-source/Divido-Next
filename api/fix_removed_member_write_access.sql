-- ============================================================
-- FIX: Stop REMOVED ("(Left)") members from writing to a group.
--
-- Background:
--   When an admin removes a member, we keep their membership row
--   (renamed "Name (Left)", email preserved) so they can still see
--   past history and request to rejoin. The old expenses rule let
--   ANY row with their email write expenses -- so a removed member
--   could keep adding/editing expenses from their phone.
--
-- This change splits access:
--   * READ  -> anyone with a membership row (incl. removed members)
--              so past history still shows.
--   * WRITE -> only ACTIVE members (name NOT ending in "(Left)").
--
-- Safe to run multiple times (idempotent).
-- Paste and run this in your Supabase project's SQL Editor.
-- ============================================================

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Remove any previous expenses policies we may have created
DROP POLICY IF EXISTS "Only members can access group expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can read group expenses" ON public.expenses;
DROP POLICY IF EXISTS "Active members can add expenses" ON public.expenses;
DROP POLICY IF EXISTS "Active members can edit expenses" ON public.expenses;
DROP POLICY IF EXISTS "Active members can delete expenses" ON public.expenses;

-- READ: any member of the group (active OR removed) can view expense history
CREATE POLICY "Members can read group expenses"
ON public.expenses FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_email = auth.jwt() ->> 'email'
  )
);

-- ADD: only active (non-removed) members
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

-- EDIT: only active (non-removed) members
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

-- DELETE: only active (non-removed) members
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

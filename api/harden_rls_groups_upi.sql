-- ============================================================
-- SECURITY FIX (Oct 29 2026): stop any signed-in user from renaming or
-- DELETING any group, and from overwriting another person's UPI ID.
--
-- Problem 1 - groups:
--   "Allow members to read/write their groups" is FOR ALL with
--   `... OR auth.role() = 'authenticated'`, which is true for EVERY signed-in
--   user. So anyone could run supabase.from('groups').delete().neq('id','')
--   and, through ON DELETE CASCADE, wipe every group's members and expenses.
--
-- Problem 2 - group_members.upi_id:
--   The member UPDATE policy lets any member update any row in the group with
--   no column limits, so a co-member could set someone else's upi_id to their
--   own and other members' Pay screens would autofill it (money goes to them).
--
-- What this changes:
--   * groups SELECT stays open to signed-in users (the invite screen reads a
--     group by id BEFORE you join). INSERT unchanged.
--   * groups UPDATE -> active members only (same rule as expenses writes).
--   * groups DELETE -> active members, or a group with NO members left (the
--     app's delete flows remove group_members first, then the group).
--   * group_members: a trigger keeps upi_id unchanged unless the row is YOUR
--     row (or an unclaimed row you are claiming as yours). It never raises,
--     so no app write fails - a foreign upi_id change is just ignored.
--
-- NOT fixed here (needs app changes - see the UAT report): anyone signed in
-- can still list groups/members and self-join any group id.
--
-- Safe to run multiple times. Run in Supabase -> SQL Editor.
-- ============================================================

-- 0. (Optional) see what is live BEFORE changing anything:
-- select relname, relrowsecurity from pg_class
--   where relname in ('groups','group_members','expenses','profiles','notifications');
-- select tablename, policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' order by tablename, policyname;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 1. groups ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow members to read/write their groups" ON public.groups;
DROP POLICY IF EXISTS "Signed-in users can read groups" ON public.groups;
DROP POLICY IF EXISTS "Active members can update their groups" ON public.groups;
DROP POLICY IF EXISTS "Active members can delete their groups" ON public.groups;

CREATE POLICY "Signed-in users can read groups"
ON public.groups FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Active members can update their groups"
ON public.groups FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = groups.id
      AND lower(gm.user_email) = lower(auth.jwt() ->> 'email')
      AND gm.name NOT ILIKE '% (Left)'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = groups.id
      AND lower(gm.user_email) = lower(auth.jwt() ->> 'email')
      AND gm.name NOT ILIKE '% (Left)'
  )
);

CREATE POLICY "Active members can delete their groups"
ON public.groups FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = groups.id
      AND lower(gm.user_email) = lower(auth.jwt() ->> 'email')
      AND gm.name NOT ILIKE '% (Left)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.group_id = groups.id
  )
);

-- 2. group_members.upi_id: only the row's owner can set it -----------------
CREATE OR REPLACE FUNCTION public.dv_guard_member_upi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  me text := lower(coalesce(auth.jwt() ->> 'email', ''));
  owner text;
BEGIN
  -- Server-side jobs (service role / SQL editor) are not restricted.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.upi_id IS NOT NULL AND lower(coalesce(NEW.user_email, '')) <> me THEN
      NEW.upi_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: whose row is it? An unclaimed row (no email) belongs to whoever
  -- is claiming it in this same update.
  owner := lower(coalesce(OLD.user_email, NEW.user_email, ''));
  IF NEW.upi_id IS DISTINCT FROM OLD.upi_id AND (me = '' OR owner <> me) THEN
    NEW.upi_id := OLD.upi_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dv_guard_member_upi ON public.group_members;
CREATE TRIGGER dv_guard_member_upi
BEFORE INSERT OR UPDATE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.dv_guard_member_upi();

-- 3. Check: should list the 3 new groups policies and no FOR ALL policy.
-- select policyname, cmd from pg_policies where tablename = 'groups';

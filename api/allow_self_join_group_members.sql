-- Allow "join as a new member" from an invite link.
--
-- The existing INSERT policy on group_members only lets you insert a row when
-- you are ALREADY a member of that group, or the group has no members yet
-- (group creation). That is why claiming works by UPDATING an existing
-- null-email placeholder row.
--
-- But an invitee who was NOT pre-added to the invite list has no placeholder to
-- claim (the claim card shows an empty list, dead-ending on Cancel). To let them
-- join, they need to INSERT their own member row — which the current policy
-- blocks. This adds one safe clause: an authenticated user may insert a row that
-- represents THEMSELVES (the new row's user_email equals their verified JWT
-- email). You can only ever add yourself, never someone else. Anyone with the
-- (unguessable UUID) invite link can already claim a placeholder, so this opens
-- no new exposure — it just covers the "no placeholder existed" case.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the app code that uses it.

DROP POLICY IF EXISTS "Allow members or creators to insert group members" ON public.group_members;
CREATE POLICY "Allow members or creators to insert group members"
ON public.group_members FOR INSERT
TO authenticated
WITH CHECK (
  -- (a) already a member of this group
  EXISTS (
    SELECT 1 FROM public.group_members EXISTING
    WHERE EXISTING.group_id = group_members.group_id
    AND EXISTING.user_email = auth.jwt() ->> 'email'
  )
  OR
  -- (b) creating a brand-new group (no members yet)
  NOT EXISTS (
    SELECT 1 FROM public.group_members EXISTING
    WHERE EXISTING.group_id = group_members.group_id
  )
  OR
  -- (c) joining yourself via an invite link: the row you insert is YOURS
  (group_members.user_email = auth.jwt() ->> 'email')
);

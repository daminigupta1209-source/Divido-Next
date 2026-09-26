-- Step 1 of the "balances by person, not by name" switch.
--
-- member_key is a permanent id for ONE member row in ONE group. Unlike
-- person_id (a cross-group identity that is shared on purpose and rewritten by
-- Merge People) and user_email / invite_email (which change on claim), it is
-- set once and NEVER changes: not on claim, rename, "(Left)", email change, or
-- merge. Expenses will reference it in later steps so two same-named people,
-- renames, and claims with a different email can't mix up balances.
--
-- Safe and additive: existing rows get a key, new rows get one automatically
-- (the default also covers older app versions that don't send it). Nothing
-- reads it for money yet. Safe to run more than once.

ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS member_key text;

UPDATE public.group_members
SET member_key = gen_random_uuid()::text
WHERE member_key IS NULL;

ALTER TABLE public.group_members
  ALTER COLUMN member_key SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.group_members
  ALTER COLUMN member_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS group_members_group_member_key_idx
  ON public.group_members (group_id, member_key);

-- Each expense records which member_key each name on it referred to when it
-- was written (filled in by the app). Nullable; old app versions ignore it.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS party_keys jsonb;

-- Check: should return 0.
SELECT count(*) AS rows_without_key FROM public.group_members WHERE member_key IS NULL;

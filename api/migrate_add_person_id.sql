-- ─────────────────────────────────────────────────────────────────────────
-- Stage 0 of the "permanent person id" refactor.
--
-- Goal: every member row must carry a STABLE key that never changes when the
-- member's display name changes. Two kinds of stable key already exist:
--   * user_email  — for signed-in members (their email never changes here)
--   * person_id   — a hidden UUID for name-only members
-- The canonical key for a member is: lower(user_email)  ELSE  person_id  ELSE name.
--
-- This script:
--   1. Ensures the person-identity columns exist (they were added ad-hoc in the
--      live DB but were never written into schema.sql). ADD COLUMN IF NOT EXISTS
--      makes this a no-op where they already exist.
--   2. Backfills a person_id for any legacy row that has NEITHER a person_id NOR
--      a user_email — i.e. the only rows that currently fall back to matching by
--      raw name. After this, every member is reachable by a stable key.
--
-- Idempotent: safe to run more than once. It does NOT touch rows that already
-- have a person_id or a user_email, so existing identities are preserved.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Columns used by the person-identity layer (documented here for reproducibility).
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS person_id text;
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS pending_name text;
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS link_request_email text;
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS link_request_name text;

-- 2. Backfill: give a stable hidden id to every keyless legacy member row.
--    gen_random_uuid() is built in on Supabase/Postgres 13+.
UPDATE public.group_members
   SET person_id = gen_random_uuid()::text
 WHERE person_id IS NULL
   AND (user_email IS NULL OR user_email = '');

-- 3. Verification (run separately to confirm 0 keyless rows remain):
-- SELECT count(*) AS keyless_rows
--   FROM public.group_members
--  WHERE person_id IS NULL
--    AND (user_email IS NULL OR user_email = '');

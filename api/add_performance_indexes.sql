-- ============================================================
-- Performance indexes for Divido.
--
-- These speed up the most common lookups the app makes:
--   * "which members are in this group?"      -> group_members(group_id)
--   * "which groups does this user belong to?" -> group_members(user_email)
--   * "which expenses belong to this group?"   -> expenses(group_id)
--
-- Without indexes Postgres scans every row; with them it jumps
-- straight to the matching rows. Bigger win as data grows.
--
-- Safe to run multiple times (IF NOT EXISTS). No data is changed.
-- Paste and run this in your Supabase project's SQL Editor.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON public.group_members (group_id);

CREATE INDEX IF NOT EXISTS idx_group_members_user_email
  ON public.group_members (user_email);

CREATE INDEX IF NOT EXISTS idx_expenses_group_id
  ON public.expenses (group_id);

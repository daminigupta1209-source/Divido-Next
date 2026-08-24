-- Divido — permanent expense IDs (Stage: fix expense temp-id -> DB-id race)
-- Changes expenses.id from a database-assigned number to client-generated text,
-- IN PLACE (no data reset — existing rows keep their id as text "5", etc.).
--
-- Safe: nothing has a foreign key to expenses.id, and the expenses RLS policies
-- key on group_id (not id), so no policies need dropping.
--
-- Run this in the Supabase SQL Editor BEFORE the new app version goes live.

ALTER TABLE public.expenses ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE public.expenses ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.expenses ALTER COLUMN id SET NOT NULL;

-- Done. expenses.id is now text; the app supplies a permanent id on insert.

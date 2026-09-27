-- Lets an admin remove a past ("Left") member from the Past Members list.
--
-- The row is kept (their old expenses still reference them, so the group's
-- balances stay correct and they can't reappear via the missing-member
-- self-heal) — it is only hidden from the list. Safe and additive; older app
-- versions ignore it. Safe to run more than once.

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;

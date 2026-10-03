-- Records who created each expense, separately from who paid it, so a group's
-- Updates Log can show "Added by X · Paid by Y".
--
-- Holds the creator's roster name as written by the app. Nullable: existing
-- rows and older app versions leave it empty (the log then shows payer only).
-- Safe and additive. Safe to run more than once.

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS added_by text;

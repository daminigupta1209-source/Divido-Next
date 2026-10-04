-- Permanent ID project, step 1 (docs/permanent-id-plan.md).
--
-- Every expense gets three ID columns next to the name columns:
--   paid_key       text   member_key of the payer
--   splitter_keys  jsonb  array of member_keys, same order as splitters
--   shares_by_key  jsonb  { member_key: amount }, same values as shares
--
-- A name that can't be matched to exactly one member row is stored as
-- 'name:<the name>' instead of a key, so nothing is ever lost and the check
-- at the bottom can count those. SYSTEM notes (joined/left) get no keys.
--
-- A trigger fills / refreshes these on EVERY insert and update, so phones still
-- running an older app version (which only send names) stay correct.
--
-- Safe and additive: nothing in the app reads these columns yet.
-- Safe to run more than once.

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_key text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS splitter_keys jsonb;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS shares_by_key jsonb;

-- member_key for one name on one expense, in order of trust:
--   1. the expense's own party_keys (exact name, then any case),
--   2. the ONE member row in that group with that name (ignoring case and
--      "(Left)"); two rows with the same name = ambiguous = no guess.
CREATE OR REPLACE FUNCTION public.dv_member_key_for(p_group_id text, p_party jsonb, p_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    p_party ->> p_name,
    (SELECT value FROM jsonb_each_text(COALESCE(p_party, '{}'::jsonb))
      WHERE lower(key) = lower(p_name) LIMIT 1),
    (SELECT min(m.member_key) FROM public.group_members m
      WHERE m.group_id::text = p_group_id
        AND lower(regexp_replace(m.name, '\s*\(Left\)\s*$', '', 'i'))
          = lower(regexp_replace(p_name, '\s*\(Left\)\s*$', '', 'i'))
      HAVING count(*) = 1),
    'name:' || p_name
  );
$$;

CREATE OR REPLACE FUNCTION public.dv_fill_expense_keys()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  gid text := NEW.group_id::text;
BEGIN
  -- Non-Group expenses have no member rows (out of scope for now).
  IF gid = 'STANDALONE' THEN
    RETURN NEW;
  END IF;

  IF NEW.paid IS NULL OR upper(NEW.paid) = 'SYSTEM' THEN
    NEW.paid_key := NULL;
    NEW.splitter_keys := NULL;
    NEW.shares_by_key := NULL;
    RETURN NEW;
  END IF;

  -- Recompute a column when it's missing, or when the names changed but the
  -- caller didn't send new keys (an older app version editing the expense).
  IF NEW.paid_key IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.paid IS DISTINCT FROM OLD.paid
         AND NEW.paid_key IS NOT DISTINCT FROM OLD.paid_key) THEN
    NEW.paid_key := public.dv_member_key_for(gid, NEW.party_keys, NEW.paid);
  END IF;

  IF NEW.splitter_keys IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.splitters IS DISTINCT FROM OLD.splitters
         AND NEW.splitter_keys IS NOT DISTINCT FROM OLD.splitter_keys) THEN
    NEW.splitter_keys := COALESCE((
      SELECT jsonb_agg(public.dv_member_key_for(gid, NEW.party_keys, s) ORDER BY ord)
      FROM jsonb_array_elements_text(COALESCE(NEW.splitters, '[]'::jsonb)) WITH ORDINALITY AS t(s, ord)
    ), '[]'::jsonb);
  END IF;

  IF NEW.shares IS NULL OR jsonb_typeof(NEW.shares) <> 'object' THEN
    NEW.shares_by_key := NULL;
  ELSIF NEW.shares_by_key IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.shares IS DISTINCT FROM OLD.shares
         AND NEW.shares_by_key IS NOT DISTINCT FROM OLD.shares_by_key) THEN
    NEW.shares_by_key := (
      SELECT jsonb_object_agg(public.dv_member_key_for(gid, NEW.party_keys, k), v)
      FROM jsonb_each(NEW.shares) AS t(k, v)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dv_fill_expense_keys ON public.expenses;
CREATE TRIGGER dv_fill_expense_keys
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.dv_fill_expense_keys();

-- Backfill every existing group expense (the trigger does the work).
UPDATE public.expenses
SET paid_key = NULL, splitter_keys = NULL, shares_by_key = NULL
WHERE paid_key IS NULL
  AND group_id::text <> 'STANDALONE';

-- ── Check ────────────────────────────────────────────────────────────────
-- 1) Totals: how many group expenses got keys.
SELECT
  count(*) FILTER (WHERE upper(paid) <> 'SYSTEM')                          AS group_expenses,
  count(*) FILTER (WHERE upper(paid) <> 'SYSTEM' AND paid_key IS NOT NULL) AS with_keys,
  count(*) FILTER (WHERE paid_key LIKE 'name:%'
                     OR splitter_keys::text LIKE '%"name:%'
                     OR shares_by_key::text LIKE '%"name:%')               AS with_unmatched_names
FROM public.expenses
WHERE group_id::text <> 'STANDALONE';

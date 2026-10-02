-- Atomic member rename: the member row AND every expense reference in the group
-- (paid, splitters, shares keys) change in ONE transaction — all or nothing, so
-- a dropped connection can never leave a balance split between two names.
-- SECURITY INVOKER: the caller's row-level-security rules still apply.
-- Run once in the Supabase SQL Editor. The app falls back to the old
-- step-by-step rename until this exists.

create or replace function public.rename_member(p_group_id text, p_old text, p_new text)
returns void
language plpgsql
security invoker
as $$
begin
  if p_old is null or p_new is null or p_old = p_new then
    return;
  end if;

  update public.expenses e
  set
    paid = case when e.paid = p_old then p_new else e.paid end,
    splitters = coalesce((
      select jsonb_agg(case when s = p_old then to_jsonb(p_new) else to_jsonb(s) end order by ord)
      from jsonb_array_elements_text(e.splitters) with ordinality as t(s, ord)
    ), '[]'::jsonb),
    shares = case
      when e.shares ? p_old then (e.shares - p_old) || jsonb_build_object(p_new, e.shares -> p_old)
      else e.shares
    end
  where e.group_id::text = p_group_id
    and (e.paid = p_old or e.splitters ? p_old or coalesce(e.shares ? p_old, false));

  update public.group_members
  set name = p_new, pending_name = null
  where group_id::text = p_group_id
    and lower(name) = lower(p_old);
end;
$$;

grant execute on function public.rename_member(text, text, text) to authenticated;

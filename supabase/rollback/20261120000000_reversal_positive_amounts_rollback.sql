-- Restores the signed-only phase2b_offset_amount from 20261119000000.
-- Does not change cost or invoice rows.

begin;

create or replace function public.phase2b_offset_amount(p_remaining numeric, p_proposed numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value numeric := coalesce(p_proposed, -coalesce(p_remaining, 0));
begin
  if coalesce(p_remaining, 0) = 0 then
    if v_value = 0 then
      return 0;
    end if;
    raise exception 'Nothing left to reverse';
  end if;
  if p_remaining > 0 then
    if v_value >= 0 or p_remaining + v_value < 0 then
      raise exception 'That amount would push the remaining balance past zero';
    end if;
  elsif v_value <= 0 or p_remaining + v_value > 0 then
    raise exception 'That amount would push the remaining balance past zero';
  end if;
  return v_value;
end;
$$;

revoke all on function public.phase2b_offset_amount(numeric, numeric) from public, anon, authenticated;

commit;

-- Phase 2b follow-up: accept a positive reversal amount.
--
-- Purpose
--   The reverse and credit-memo sheets ask for a positive amount, up to
--   the remaining balance. phase2b_offset_amount stores the opposite sign.
--   A value that is already the stored offset (negative when the balance
--   is positive) still works, so earlier callers keep working.
--   Landing on a remaining balance of exactly zero is allowed.
--
-- Assumes
--   20261119000000 is applied. Safe to run twice. One transaction.
--   Does not change existing rows.
--
-- Verify
--   supabase/tests/phase2b_checks.sql posts full and partial reversals
--   and credit memos with positive amounts, including a remainder of zero.

begin;

create or replace function public.phase2b_offset_amount(p_remaining numeric, p_proposed numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_input numeric := p_proposed;
  v_value numeric;
begin
  if coalesce(p_remaining, 0) = 0 then
    if coalesce(v_input, 0) = 0 then
      return 0;
    end if;
    raise exception 'Nothing left to reverse';
  end if;

  if v_input is not null and v_input = 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  -- A positive number is the amount the person typed. Store the opposite
  -- sign of the remaining balance. A number that already has that opposite
  -- sign is the stored offset and is kept.
  if v_input is null then
    v_value := -p_remaining;
  elsif p_remaining > 0 and v_input > 0 then
    v_value := -v_input;
  elsif p_remaining < 0 and v_input < 0 then
    v_value := -v_input;
  else
    v_value := v_input;
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

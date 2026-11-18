-- Rolls back 20261118000300_baseline_access.sql.
-- Drops the deny policy and gives the service role its table grant back.
-- anon and authenticated stay revoked, which is how 20261118000000 left them.
-- The table itself stays. The category rollback drops it.

begin;

drop policy if exists phase2_cost_baseline_no_access on public.phase2_cost_baseline;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.phase2_cost_baseline to service_role';
  end if;
end $$;

commit;

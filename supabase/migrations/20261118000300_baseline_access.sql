-- Phase 2: keep the cost baseline off the API.
--
-- Purpose
--   phase2_cost_baseline stores pre-backfill cost totals so a migration
--   re-run can prove nothing moved. It is not an app table. Row security was
--   on and grants were revoked, but there was no policy, which the security
--   advisor reports as "RLS enabled, no policies".
--
--   This adds a policy that matches no rows, and revokes the service role
--   as well. The service role bypasses row security, so a policy alone would
--   not stop it. The migration role still owns the table and can read it.
--
-- Assumes
--   20261118000000_cost_categories.sql has been applied. Safe to run twice.
--   One transaction. Does not rewrite cost rows.

begin;

drop policy if exists phase2_cost_baseline_no_access on public.phase2_cost_baseline;

create policy phase2_cost_baseline_no_access
  on public.phase2_cost_baseline
  for all
  to public
  using (false)
  with check (false);

revoke all on table public.phase2_cost_baseline from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on table public.phase2_cost_baseline from service_role';
  end if;
end $$;

commit;

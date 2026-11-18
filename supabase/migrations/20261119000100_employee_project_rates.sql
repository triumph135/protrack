-- Phase 2b: per-project employee rates with an effective date.
--
-- Purpose
--   Store a rate card for one employee on one project, starting on
--   effective_date. Labor dated on or after that date uses the latest
--   card that has already started. Otherwise the company rates on
--   employees are used. Historical cost rows are not rewritten.
--
-- Assumes
--   employees, projects, and tenants exist. Safe to run twice.
--   One transaction. The table starts empty, so existing labor totals
--   do not change.
--
-- Verify
--   supabase/tests/phase2b_checks.sql calls employee_rates_as_of with
--   no override, an override on the entry date, and a later override
--   that must not apply to an earlier date.

begin;

create table if not exists public.employee_project_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  effective_date date not null,
  standard_rate numeric not null,
  ot_rate numeric not null,
  dt_rate numeric not null,
  mob_rate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_project_rates_unique unique (employee_id, project_id, effective_date),
  constraint employee_project_rates_standard_nonnegative check (standard_rate >= 0),
  constraint employee_project_rates_ot_nonnegative check (ot_rate >= 0),
  constraint employee_project_rates_dt_nonnegative check (dt_rate >= 0),
  constraint employee_project_rates_mob_nonnegative check (mob_rate is null or mob_rate >= 0)
);

create index if not exists employee_project_rates_lookup_idx
  on public.employee_project_rates (employee_id, project_id, effective_date desc);

alter table public.employee_project_rates enable row level security;

drop policy if exists employee_project_rates_select on public.employee_project_rates;
drop policy if exists employee_project_rates_insert on public.employee_project_rates;
drop policy if exists employee_project_rates_update on public.employee_project_rates;
drop policy if exists employee_project_rates_delete on public.employee_project_rates;

create policy employee_project_rates_select on public.employee_project_rates
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
  );

create policy employee_project_rates_insert on public.employee_project_rates
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and exists (
      select 1 from public.employees e
      where e.id = employee_id and e.tenant_id = public.current_tenant_id()
    )
  );

create policy employee_project_rates_update on public.employee_project_rates
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and exists (
      select 1 from public.employees e
      where e.id = employee_id and e.tenant_id = public.current_tenant_id()
    )
  );

create policy employee_project_rates_delete on public.employee_project_rates
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_master()
    and public.can_see_project(project_id)
  );

revoke all on table public.employee_project_rates from public, anon;
grant select, insert, update, delete on table public.employee_project_rates to authenticated;

create or replace function public.employee_rates_as_of(
  p_employee_id uuid,
  p_project_id uuid,
  p_on date
) returns table (
  standard_rate numeric,
  ot_rate numeric,
  dt_rate numeric,
  mob_rate numeric,
  effective_date date,
  source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp public.employees%rowtype;
  v_rate public.employee_project_rates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_on is null then
    raise exception 'A date is required';
  end if;

  select * into v_emp from public.employees where id = p_employee_id;
  if v_emp.id is null or v_emp.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Employee not found';
  end if;
  if p_project_id is not null and not public.can_see_project(p_project_id) then
    raise exception 'You cannot see this project';
  end if;

  select * into v_rate
  from public.employee_project_rates r
  where r.employee_id = p_employee_id
    and r.project_id = p_project_id
    and r.effective_date <= p_on
  order by r.effective_date desc
  limit 1;

  if v_rate.id is not null then
    standard_rate := v_rate.standard_rate;
    ot_rate := v_rate.ot_rate;
    dt_rate := v_rate.dt_rate;
    mob_rate := v_rate.mob_rate;
    effective_date := v_rate.effective_date;
    source := 'override';
    return next;
    return;
  end if;

  standard_rate := v_emp.standard_rate;
  ot_rate := v_emp.ot_rate;
  dt_rate := v_emp.dt_rate;
  mob_rate := v_emp.mob_rate;
  effective_date := null;
  source := 'employee';
  return next;
end;
$$;

revoke all on function public.employee_rates_as_of(uuid, uuid, date) from public, anon;
grant execute on function public.employee_rates_as_of(uuid, uuid, date) to authenticated;

commit;

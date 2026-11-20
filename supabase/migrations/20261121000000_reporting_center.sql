-- Phase 2c: Reporting Center.
--
-- Purpose
--   Saved reports, schedules, recipients, runs, and deliveries. Adds
--   report_access_scope (service role only), report_next_run_at, and
--   claim_due_report_runs. Does not enable pg_cron or pg_net. The operator
--   runs supabase/manual/reports_cron_setup.sql later.
--
-- Assumes
--   Migrations through 20261120000100 are applied. Safe to run twice.
--   One transaction. No existing table, column, or function is redefined.
--   New tables start empty. Cost and invoice amounts are not updated.
--   "Master" is the admin role. Report mail is sent from
--   reports@protrackusa.com once the operator turns sending on.
--
-- DST
--   report_next_run_at builds a timestamp without time zone and converts it
--   with AT TIME ZONE, which is how Postgres maps a missing or repeated
--   local time. On Postgres 16, the spring-forward gap (2:00 AM America/New_York)
--   is read as standard time, so the instant falls after the jump (07:00 UTC).
--   The fall-back overlap is read as standard time too (1:00 AM is 06:00 UTC).
--
-- Verify
--   supabase/tests/phase2c_checks.sql. Scope matches RLS. Sums of existing
--   project_costs.cost and customer_invoices.amount are unchanged.

begin;

create table if not exists public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  report_key text not null check (report_key in (
    'activity', 'job_cost_summary', 'cost_detail', 'labor_by_employee',
    'invoicing_gp', 'portfolio', 'vendor_spend', 'custom'
  )),
  config jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists report_definitions_owner_name_key
  on public.report_definitions (tenant_id, owner_id, lower(name));

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  report_key text not null check (report_key in (
    'activity', 'job_cost_summary', 'cost_detail', 'labor_by_employee',
    'invoicing_gp', 'portfolio', 'vendor_spend', 'custom'
  )),
  report_definition_id uuid null references public.report_definitions(id) on delete set null,
  config jsonb not null default '{}'::jsonb,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekday smallint null check (weekday between 0 and 6),
  month_day smallint null check (month_day between 1 and 31),
  send_hour smallint not null check (send_hour between 0 and 23),
  formats text[] not null check (formats <@ array['pdf', 'csv', 'xlsx']::text[] and cardinality(formats) >= 1),
  status text not null default 'active' check (status in ('active', 'paused')),
  paused_reason text null,
  next_run_at timestamptz null,
  last_run_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((frequency = 'weekly') = (weekday is not null)),
  check ((frequency = 'monthly') = (month_day is not null))
);

create index if not exists report_schedules_due_idx
  on public.report_schedules (status, next_run_at)
  where status = 'active';

create table if not exists public.report_schedule_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  schedule_id uuid not null references public.report_schedules(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  unsubscribe_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  unsubscribed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (schedule_id, user_id)
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  schedule_id uuid not null references public.report_schedules(id) on delete cascade,
  scheduled_for timestamptz not null,
  trigger text not null check (trigger in ('schedule', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'sent', 'partial', 'failed', 'skipped')),
  attempts smallint not null default 0,
  lease_until timestamptz null,
  started_at timestamptz null,
  finished_at timestamptz null,
  error text null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (schedule_id, scheduled_for)
);

create table if not exists public.report_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.report_runs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  resend_id text null,
  error text null,
  sent_at timestamptz null,
  unique (run_id, user_id)
);

drop trigger if exists report_definitions_updated_at on public.report_definitions;
create trigger report_definitions_updated_at
  before update on public.report_definitions
  for each row execute function public.update_updated_at_column();

drop trigger if exists report_schedules_updated_at on public.report_schedules;
create trigger report_schedules_updated_at
  before update on public.report_schedules
  for each row execute function public.update_updated_at_column();

create or replace function public.report_recipient_same_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_schedule_tenant uuid;
  v_user_tenant uuid;
begin
  select tenant_id into v_schedule_tenant from public.report_schedules where id = new.schedule_id;
  select tenant_id into v_user_tenant from public.users where id = new.user_id;
  if v_schedule_tenant is null
     or v_user_tenant is distinct from v_schedule_tenant
     or new.tenant_id is distinct from v_schedule_tenant then
    raise exception 'Recipients must be users in your company';
  end if;
  return new;
end;
$$;

drop trigger if exists report_recipient_same_tenant on public.report_schedule_recipients;
create trigger report_recipient_same_tenant
  before insert or update on public.report_schedule_recipients
  for each row execute function public.report_recipient_same_tenant();

create or replace function public.report_access_scope(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_prev text;
  v_tz text;
  v_projects jsonb;
  v_categories jsonb;
  v_perms jsonb;
  v_invoices boolean;
  v_employees boolean;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found or v_user.tenant_id is null or coalesce(v_user.is_active, false) = false then
    return jsonb_build_object(
      'tenant_id', null,
      'user_id', p_user_id,
      'role', case when found then v_user.role else null end,
      'is_active', coalesce(v_user.is_active, false),
      'timezone', 'America/New_York',
      'project_ids', '[]'::jsonb,
      'read_category_ids', '[]'::jsonb,
      'invoices_read', false,
      'employees_read', false,
      'can_schedule', false
    );
  end if;

  select coalesce(nullif(settings ->> 'timezone', ''), 'America/New_York')
    into v_tz
  from public.tenants
  where id = v_user.tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  begin
    perform now() at time zone v_tz;
  exception when others then
    v_tz := 'America/New_York';
  end;

  v_prev := current_setting('request.jwt.claims', true);
  begin
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
      true
    );

    select coalesce(jsonb_agg(p.id order by p.id), '[]'::jsonb)
      into v_projects
    from public.projects p
    where p.tenant_id = v_user.tenant_id
      and public.can_see_project(p.id);

    select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb)
      into v_categories
    from public.cost_categories c
    where c.tenant_id = v_user.tenant_id
      and public.can_access_category(c.id, 'read');

    perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);
    raise;
  end;

  v_perms := coalesce(v_user.permissions, '{}'::jsonb);
  if v_user.role = 'master' then
    v_invoices := true;
    v_employees := true;
  else
    v_invoices := coalesce(v_perms ->> 'invoices', 'none') in ('read', 'write');
    if v_perms ? 'employees' then
      v_employees := (v_perms ->> 'employees') in ('read', 'write');
    else
      v_employees := coalesce(v_perms ->> 'labor', 'none') in ('read', 'write');
    end if;
  end if;

  return jsonb_build_object(
    'tenant_id', v_user.tenant_id,
    'user_id', v_user.id,
    'role', v_user.role,
    'is_active', true,
    'timezone', v_tz,
    'project_ids', v_projects,
    'read_category_ids', v_categories,
    'invoices_read', v_invoices,
    'employees_read', v_employees,
    'can_schedule', v_user.role in ('master', 'entry')
  );
end;
$$;

create or replace function public.report_next_run_at(
  p_frequency text,
  p_weekday smallint,
  p_month_day smallint,
  p_send_hour smallint,
  p_tz text,
  p_after timestamptz
) returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(p_tz, ''), 'America/New_York');
  v_start date;
  v_day date;
  v_i integer;
  v_dom integer;
  v_last integer;
  v_local timestamp;
  v_at timestamptz;
begin
  if p_frequency not in ('daily', 'weekly', 'monthly') then
    raise exception 'frequency must be daily, weekly, or monthly';
  end if;
  if p_send_hour < 0 or p_send_hour > 23 then
    raise exception 'send hour must be between 0 and 23';
  end if;
  begin
    perform now() at time zone v_tz;
  exception when others then
    v_tz := 'America/New_York';
  end;

  v_start := (p_after at time zone v_tz)::date;
  for v_i in 0..399 loop
    v_day := v_start + v_i;
    if p_frequency = 'weekly' and extract(dow from v_day)::int <> p_weekday then
      continue;
    end if;
    if p_frequency = 'monthly' then
      v_last := extract(day from (date_trunc('month', v_day::timestamp) + interval '1 month - 1 day'))::int;
      v_dom := least(p_month_day, v_last);
      if extract(day from v_day)::int <> v_dom then
        continue;
      end if;
    end if;
    v_local := v_day + make_time(p_send_hour, 0, 0);
    v_at := v_local at time zone v_tz;
    if v_at > p_after then
      return v_at;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.claim_due_report_runs(p_limit int default 5)
returns setof public.report_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sched public.report_schedules%rowtype;
  v_tz text;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 5;
  end if;

  for v_sched in
    select *
    from public.report_schedules
    where status = 'active'
      and next_run_at is not null
      and next_run_at <= now()
    order by next_run_at
    for update skip locked
    limit p_limit
  loop
    insert into public.report_runs (tenant_id, schedule_id, scheduled_for, trigger, status)
    values (v_sched.tenant_id, v_sched.id, v_sched.next_run_at, 'schedule', 'queued')
    on conflict (schedule_id, scheduled_for) do nothing;

    select coalesce(nullif(settings ->> 'timezone', ''), 'America/New_York')
      into v_tz
    from public.tenants
    where id = v_sched.tenant_id;

    update public.report_schedules
    set next_run_at = public.report_next_run_at(
          v_sched.frequency,
          v_sched.weekday,
          v_sched.month_day,
          v_sched.send_hour,
          coalesce(v_tz, 'America/New_York'),
          now()
        ),
        last_run_at = now()
    where id = v_sched.id;
  end loop;

  update public.report_runs
  set status = 'failed',
      error = 'Gave up after 3 attempts',
      finished_at = now(),
      lease_until = null
  where attempts >= 3
    and status in ('queued', 'running')
    and (status = 'queued' or lease_until < now());

  return query
  with picked as (
    select id
    from public.report_runs
    where status = 'queued'
       or (status = 'running' and lease_until < now() and attempts < 3)
    order by created_at
    for update skip locked
    limit p_limit
  ),
  leased as (
    update public.report_runs as run
    set status = 'running',
        attempts = run.attempts + 1,
        lease_until = now() + interval '5 minutes',
        started_at = coalesce(run.started_at, now())
    from picked
    where run.id = picked.id
    returning run.*
  )
  select * from leased;
end;
$$;

create or replace function public.report_schedules_tz_resync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.report_schedules%rowtype;
  v_tz text;
begin
  if new.settings ->> 'timezone' is not distinct from old.settings ->> 'timezone' then
    return new;
  end if;
  v_tz := coalesce(nullif(new.settings ->> 'timezone', ''), 'America/New_York');
  for v_row in
    select * from public.report_schedules
    where tenant_id = new.id and status = 'active'
  loop
    update public.report_schedules
    set next_run_at = public.report_next_run_at(
      v_row.frequency, v_row.weekday, v_row.month_day, v_row.send_hour, v_tz, now()
    )
    where id = v_row.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists report_schedules_tz_resync on public.tenants;
create trigger report_schedules_tz_resync
  after update of settings on public.tenants
  for each row execute function public.report_schedules_tz_resync();

create or replace function public.report_user_is_recipient(p_schedule_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.report_schedule_recipients recipient
    where recipient.schedule_id = p_schedule_id
      and recipient.user_id = public.current_profile_id()
  );
$$;

create or replace function public.report_user_can_manage_schedule(p_schedule_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.report_schedules schedule
    where schedule.id = p_schedule_id
      and schedule.tenant_id = public.current_tenant_id()
      and (schedule.owner_id = public.current_profile_id() or public.is_master())
  );
$$;

alter table public.report_definitions enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_schedule_recipients enable row level security;
alter table public.report_runs enable row level security;
alter table public.report_deliveries enable row level security;

drop policy if exists report_definitions_select on public.report_definitions;
create policy report_definitions_select on public.report_definitions
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (owner_id = public.current_profile_id() or is_shared));

drop policy if exists report_schedules_select on public.report_schedules;
create policy report_schedules_select on public.report_schedules
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      owner_id = public.current_profile_id()
      or public.is_master()
      or public.report_user_is_recipient(id)
    )
  );

drop policy if exists report_schedule_recipients_select on public.report_schedule_recipients;
create policy report_schedule_recipients_select on public.report_schedule_recipients
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = public.current_profile_id()
      or public.report_user_can_manage_schedule(schedule_id)
    )
  );

drop policy if exists report_runs_select on public.report_runs;
create policy report_runs_select on public.report_runs
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.report_user_can_manage_schedule(schedule_id)
  );

drop policy if exists report_deliveries_select on public.report_deliveries;
create policy report_deliveries_select on public.report_deliveries
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1
      from public.report_runs run
      where run.id = report_deliveries.run_id
        and public.report_user_can_manage_schedule(run.schedule_id)
    )
  );

revoke all on table public.report_definitions from public, anon, authenticated;
revoke all on table public.report_schedules from public, anon, authenticated;
revoke all on table public.report_schedule_recipients from public, anon, authenticated;
revoke all on table public.report_runs from public, anon, authenticated;
revoke all on table public.report_deliveries from public, anon, authenticated;

grant select on table public.report_definitions to authenticated;
grant select on table public.report_schedules to authenticated;
grant select (
  id, tenant_id, schedule_id, user_id, unsubscribed_at, created_at
) on table public.report_schedule_recipients to authenticated;
grant select on table public.report_runs to authenticated;
grant select on table public.report_deliveries to authenticated;

grant select, insert, update, delete on table public.report_definitions to service_role;
grant select, insert, update, delete on table public.report_schedules to service_role;
grant select, insert, update, delete on table public.report_schedule_recipients to service_role;
grant select, insert, update, delete on table public.report_runs to service_role;
grant select, insert, update, delete on table public.report_deliveries to service_role;

-- Table-level select would include unsubscribe_token again, so authenticated
-- is granted every column except that token. service_role keeps table select.
revoke select (unsubscribe_token) on table public.report_schedule_recipients from public, anon, authenticated;

revoke all on function public.report_access_scope(uuid) from public, anon, authenticated;
grant execute on function public.report_access_scope(uuid) to service_role;

revoke all on function public.claim_due_report_runs(int) from public, anon, authenticated;
grant execute on function public.claim_due_report_runs(int) to service_role;

revoke all on function public.report_next_run_at(text, smallint, smallint, smallint, text, timestamptz) from public, anon;
grant execute on function public.report_next_run_at(text, smallint, smallint, smallint, text, timestamptz) to authenticated, service_role;

revoke all on function public.report_recipient_same_tenant() from public, anon, authenticated;
revoke all on function public.report_schedules_tz_resync() from public, anon, authenticated;
revoke all on function public.report_user_is_recipient(uuid) from public, anon;
revoke all on function public.report_user_can_manage_schedule(uuid) from public, anon;
grant execute on function public.report_user_is_recipient(uuid) to authenticated, service_role;
grant execute on function public.report_user_can_manage_schedule(uuid) to authenticated, service_role;

commit;

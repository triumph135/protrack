-- Phase 2c checks. Run after the reporting migration and phase2c_synthetic.sql.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/phase2c_checks.sql
-- The script rolls back its own writes. A failed check raises.

begin;

create temp table phase2c_results (
  check_name text primary key,
  status text not null,
  detail text
);
grant select, insert, update, delete on phase2c_results to authenticated;

insert into phase2c_results
select 'preserved_acme_cost_sum',
  case when coalesce(sum(cost), 0) = 4834.50 then 'PASS' else 'FAIL' end,
  coalesce(sum(cost)::text, 'none')
from public.project_costs
where project_id = '22222222-2222-4222-8222-2222222222a1';

insert into phase2c_results
select 'preserved_beta_cost_sum',
  case when coalesce(sum(cost), 0) = 175 then 'PASS' else 'FAIL' end,
  coalesce(sum(cost)::text, 'none')
from public.project_costs
where project_id = '22222222-2222-4222-8222-2222222222b1';

insert into phase2c_results
select 'preserved_acme_invoice_sum',
  case when coalesce(sum(amount), 0) = 2300 then 'PASS' else 'FAIL' end,
  coalesce(sum(amount)::text, 'none')
from public.customer_invoices
where project_id = '22222222-2222-4222-8222-2222222222a1';

insert into phase2c_results
select 'preserved_beta_invoice_sum',
  case when coalesce(sum(amount), 0) = 400 then 'PASS' else 'FAIL' end,
  coalesce(sum(amount)::text, 'none')
from public.customer_invoices
where project_id = '22222222-2222-4222-8222-2222222222b1';

insert into phase2c_results
select 'job_a3_present',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  count(*)::text
from public.projects
where id = '22222222-2222-4222-8222-2222222222a3';

do $$
declare
  v_user uuid;
  v_scope jsonb;
  v_before text;
  v_after text;
  v_visible jsonb;
  v_readable jsonb;
begin
  for v_user in
    select id from public.users
    where id in (
      '11111111-1111-4111-8111-1111111111a1',
      '11111111-1111-4111-8111-1111111111a2',
      '11111111-1111-4111-8111-1111111111a4',
      '11111111-1111-4111-8111-1111111111a5',
      '11111111-1111-4111-8111-1111111111b1'
    )
  loop
    v_scope := public.report_access_scope(v_user);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text,
      true
    );
    execute 'set local role authenticated';
    select coalesce(jsonb_agg(p.id order by p.id), '[]'::jsonb) into v_visible
    from public.projects p
    where public.can_see_project(p.id);
    select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb) into v_readable
    from public.cost_categories c
    where public.can_access_category(c.id, 'read');
    insert into phase2c_results values (
      'scope_projects_' || right(v_user::text, 2),
      case when v_scope -> 'project_ids' = v_visible then 'PASS' else 'FAIL' end,
      v_scope ->> 'role'
    );
    insert into phase2c_results values (
      'scope_categories_' || right(v_user::text, 2),
      case when v_scope -> 'read_category_ids' = v_readable then 'PASS' else 'FAIL' end,
      null
    );
    reset role;
  end loop;
  perform set_config('request.jwt.claims', '{"sub":"restore-check","role":"authenticated"}', true);
  v_before := current_setting('request.jwt.claims', true);
  perform public.report_access_scope('11111111-1111-4111-8111-1111111111a1');
  v_after := current_setting('request.jwt.claims', true);
  insert into phase2c_results values (
    'scope_restores_claims',
    case when v_after = v_before then 'PASS' else 'FAIL' end,
    left(coalesce(v_after, ''), 80)
  );

  update public.tenants
  set settings = coalesce(settings, '{}'::jsonb) || '{"project_visibility":"assigned"}'::jsonb
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_scope := public.report_access_scope('11111111-1111-4111-8111-1111111111a5');
  insert into phase2c_results values (
    'assigned_pm_sees_only_assigned_project',
    case when v_scope -> 'project_ids' = jsonb_build_array('22222222-2222-4222-8222-2222222222a3'::uuid) then 'PASS' else 'FAIL' end,
    v_scope ->> 'project_ids'
  );
  insert into phase2c_results values (
    'limited_pm_cannot_schedule_invoices',
    case when (v_scope ->> 'invoices_read') = 'false' and (v_scope ->> 'can_schedule') = 'true' then 'PASS' else 'FAIL' end,
    v_scope ->> 'invoices_read'
  );
end $$;

do $$
declare
  v_message text;
begin
  begin
    execute 'set local role authenticated';
    perform public.report_access_scope('11111111-1111-4111-8111-1111111111a1');
    insert into phase2c_results values ('scope_denied_to_authenticated', 'FAIL', 'call succeeded');
  exception when insufficient_privilege then
    insert into phase2c_results values ('scope_denied_to_authenticated', 'PASS', null);
  when others then
    get stacked diagnostics v_message = message_text;
    insert into phase2c_results values (
      'scope_denied_to_authenticated',
      case when v_message ilike '%permission%' or v_message ilike '%privilege%' then 'PASS' else 'FAIL' end,
      v_message
    );
  end;
  reset role;
end $$;

insert into phase2c_results
select 'next_daily_before_hour',
  case when public.report_next_run_at('daily', null::smallint, null::smallint, 7::smallint, 'America/New_York', '2026-03-10 10:30:00+00') = '2026-03-10 11:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('daily', null::smallint, null::smallint, 7::smallint, 'America/New_York', '2026-03-10 10:30:00+00')::text;

insert into phase2c_results
select 'next_daily_after_hour',
  case when public.report_next_run_at('daily', null::smallint, null::smallint, 7::smallint, 'America/New_York', '2026-03-10 12:00:00+00') = '2026-03-11 11:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('daily', null::smallint, null::smallint, 7::smallint, 'America/New_York', '2026-03-10 12:00:00+00')::text;

insert into phase2c_results
select 'next_weekly_wrap',
  case when public.report_next_run_at('weekly', 1::smallint, null::smallint, 7::smallint, 'America/New_York', '2026-03-09 12:00:00+00') = '2026-03-16 11:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('weekly', 1::smallint, null::smallint, 7::smallint, 'America/New_York', '2026-03-09 12:00:00+00')::text;

insert into phase2c_results
select 'next_monthly_feb_non_leap',
  case when public.report_next_run_at('monthly', null::smallint, 31::smallint, 7::smallint, 'America/New_York', '2026-02-01 00:00:00+00') = '2026-02-28 12:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('monthly', null::smallint, 31::smallint, 7::smallint, 'America/New_York', '2026-02-01 00:00:00+00')::text;

insert into phase2c_results
select 'next_monthly_feb_leap',
  case when public.report_next_run_at('monthly', null::smallint, 31::smallint, 7::smallint, 'America/New_York', '2024-02-01 00:00:00+00') = '2024-02-29 12:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('monthly', null::smallint, 31::smallint, 7::smallint, 'America/New_York', '2024-02-01 00:00:00+00')::text;

insert into phase2c_results
select 'next_monthly_april',
  case when public.report_next_run_at('monthly', null::smallint, 31::smallint, 7::smallint, 'America/New_York', '2026-04-01 00:00:00+00') = '2026-04-30 11:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('monthly', null::smallint, 31::smallint, 7::smallint, 'America/New_York', '2026-04-01 00:00:00+00')::text;

insert into phase2c_results
select 'next_dst_spring',
  case when public.report_next_run_at('daily', null::smallint, null::smallint, 2::smallint, 'America/New_York', '2026-03-08 06:00:00+00') = '2026-03-08 07:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('daily', null::smallint, null::smallint, 2::smallint, 'America/New_York', '2026-03-08 06:00:00+00')::text;

insert into phase2c_results
select 'next_dst_fall',
  case when public.report_next_run_at('daily', null::smallint, null::smallint, 1::smallint, 'America/New_York', '2026-11-01 04:00:00+00') = '2026-11-01 06:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('daily', null::smallint, null::smallint, 1::smallint, 'America/New_York', '2026-11-01 04:00:00+00')::text;

insert into phase2c_results
select 'next_london',
  case when public.report_next_run_at('daily', null::smallint, null::smallint, 9::smallint, 'Europe/London', '2026-06-01 07:00:00+00') = '2026-06-01 08:00:00+00'
    then 'PASS' else 'FAIL' end,
  public.report_next_run_at('daily', null::smallint, null::smallint, 9::smallint, 'Europe/London', '2026-06-01 07:00:00+00')::text;

do $$
declare
  v_schedule uuid;
  v_other uuid;
  v_run uuid;
  v_next timestamptz;
  v_count int;
  v_attempts smallint;
  v_status text;
  v_error text;
  v_message text;
begin
  insert into public.report_schedules (
    tenant_id, owner_id, name, report_key, config, frequency, weekday, send_hour, formats, status, next_run_at
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-1111111111a2',
    'PM morning',
    'activity',
    '{"params":{"range":"last_year","projects":"all","project_status":"all"}}'::jsonb,
    'daily', null, 7, array['pdf'], 'active', now() - interval '1 minute'
  ) returning id into v_schedule;

  insert into public.report_schedules (
    tenant_id, owner_id, name, report_key, config, frequency, weekday, send_hour, formats, status, next_run_at
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-1111111111a5',
    'Other PM',
    'activity',
    '{}'::jsonb,
    'weekly', 1, 8, array['csv'], 'active', now() + interval '7 days'
  ) returning id into v_other;

  begin
    insert into public.report_schedule_recipients (tenant_id, schedule_id, user_id)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      v_schedule,
      '11111111-1111-4111-8111-1111111111b1'
    );
    insert into phase2c_results values ('other_tenant_recipient', 'FAIL', 'insert succeeded');
  exception when others then
    get stacked diagnostics v_message = message_text;
    insert into phase2c_results values (
      'other_tenant_recipient',
      case when v_message = 'Recipients must be users in your company' then 'PASS' else 'FAIL' end,
      v_message
    );
  end;

  insert into public.report_schedule_recipients (tenant_id, schedule_id, user_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_schedule, '11111111-1111-4111-8111-1111111111a4');

  select next_run_at into v_next from public.report_schedules where id = v_schedule;
  perform public.claim_due_report_runs(5);
  select count(*) into v_count from public.report_runs where schedule_id = v_schedule;
  insert into phase2c_results values (
    'claim_inserts_one_run',
    case when v_count = 1 then 'PASS' else 'FAIL' end,
    v_count::text
  );
  insert into phase2c_results
  select 'claim_advances_next',
    case when next_run_at > v_next then 'PASS' else 'FAIL' end,
    next_run_at::text
  from public.report_schedules where id = v_schedule;

  perform public.claim_due_report_runs(5);
  select count(*) into v_count from public.report_runs where schedule_id = v_schedule;
  insert into phase2c_results values (
    'claim_does_not_double',
    case when v_count = 1 then 'PASS' else 'FAIL' end,
    v_count::text
  );

  select id into v_run from public.report_runs where schedule_id = v_schedule;
  update public.report_runs
  set status = 'running', attempts = 2, lease_until = now() - interval '1 minute'
  where id = v_run;
  perform public.claim_due_report_runs(5);
  select attempts, status into v_attempts, v_status from public.report_runs where id = v_run;
  insert into phase2c_results values (
    'claim_releases_expired',
    case when v_attempts = 3 and v_status = 'running' then 'PASS' else 'FAIL' end,
    v_attempts::text || ' ' || v_status
  );

  update public.report_runs
  set status = 'running', attempts = 3, lease_until = now() - interval '1 minute'
  where id = v_run;
  perform public.claim_due_report_runs(5);
  select status, error into v_status, v_error from public.report_runs where id = v_run;
  insert into phase2c_results values (
    'claim_gives_up',
    case when v_status = 'failed' and v_error = 'Gave up after 3 attempts' then 'PASS' else 'FAIL' end,
    coalesce(v_error, v_status)
  );

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a2","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into v_count from public.report_schedules where id = v_other;
  insert into phase2c_results values (
    'pm_cannot_see_other_pm_schedule',
    case when v_count = 0 then 'PASS' else 'FAIL' end,
    v_count::text
  );

  begin
    execute 'select unsubscribe_token from public.report_schedule_recipients where schedule_id = $1' using v_schedule;
    insert into phase2c_results values ('recipient_token_hidden', 'FAIL', 'select succeeded');
  exception when insufficient_privilege then
    insert into phase2c_results values ('recipient_token_hidden', 'PASS', null);
  when others then
    get stacked diagnostics v_message = message_text;
    insert into phase2c_results values (
      'recipient_token_hidden',
      case when v_message ilike '%permission%' or v_message ilike '%privilege%' then 'PASS' else 'FAIL' end,
      v_message
    );
  end;

  begin
    insert into public.report_definitions (tenant_id, owner_id, name, report_key)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-1111111111a2', 'Nope', 'activity');
    insert into phase2c_results values ('authenticated_cannot_write', 'FAIL', 'insert succeeded');
  exception when insufficient_privilege then
    insert into phase2c_results values ('authenticated_cannot_write', 'PASS', null);
  when others then
    get stacked diagnostics v_message = message_text;
    insert into phase2c_results values (
      'authenticated_cannot_write',
      case when v_message ilike '%permission%' or v_message ilike '%privilege%' or v_message ilike '%policy%' then 'PASS' else 'FAIL' end,
      v_message
    );
  end;
  reset role;
end $$;

do $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  insert into public.report_schedules (
    tenant_id, owner_id, name, report_key, frequency, send_hour, formats, status, next_run_at
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-1111111111a1',
    'Timezone check',
    'portfolio',
    'daily', 6, array['pdf'], 'active', now() - interval '1 day'
  );
  select next_run_at into v_before
  from public.report_schedules
  where name = 'Timezone check';
  update public.tenants
  set settings = coalesce(settings, '{}'::jsonb) || '{"timezone":"America/Chicago"}'::jsonb
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  select next_run_at into v_after
  from public.report_schedules
  where name = 'Timezone check';
  insert into phase2c_results values (
    'timezone_trigger_recomputes',
    case when v_after is distinct from v_before and v_after > now() then 'PASS' else 'FAIL' end,
    v_after::text
  );
end $$;

do $$
declare
  v_row record;
begin
  for v_row in select check_name, detail from phase2c_results where status <> 'PASS' order by check_name
  loop
    raise exception 'phase2c check failed: % (%)', v_row.check_name, v_row.detail;
  end loop;
  raise notice 'phase2c checks passed (% )', (select count(*) from phase2c_results);
end $$;

rollback;

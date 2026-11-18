-- Phase 2b checks. Run after scripts/db-local-reset.sh (snapshot, migrations, seed).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/phase2b_checks.sql
-- The script rolls back its own writes. A failed check raises.

begin;

create temp table phase2b_results (
  check_name text primary key,
  status text not null,
  detail text
);
grant select, insert, update, delete on phase2b_results to authenticated;

insert into phase2b_results
select
  'preserved_acme_cost_sum',
  case when coalesce(sum(cost), 0) = 4834.50 then 'PASS' else 'FAIL' end,
  coalesce(sum(cost)::text, 'none')
from public.project_costs
where project_id = '22222222-2222-4222-8222-2222222222a1';

insert into phase2b_results
select
  'preserved_beta_cost_sum',
  case when coalesce(sum(cost), 0) = 175 then 'PASS' else 'FAIL' end,
  coalesce(sum(cost)::text, 'none')
from public.project_costs
where project_id = '22222222-2222-4222-8222-2222222222b1';

insert into phase2b_results
select
  'preserved_acme_invoice_sum',
  case when coalesce(sum(amount), 0) = 2300 then 'PASS' else 'FAIL' end,
  coalesce(sum(amount)::text, 'none')
from public.customer_invoices
where project_id = '22222222-2222-4222-8222-2222222222a1';

insert into phase2b_results
select
  'preserved_beta_invoice_sum',
  case when coalesce(sum(amount), 0) = 400 then 'PASS' else 'FAIL' end,
  coalesce(sum(amount)::text, 'none')
from public.customer_invoices
where project_id = '22222222-2222-4222-8222-2222222222b1';

insert into phase2b_results
select
  'no_existing_cost_reversal',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  count(*)::text
from public.project_costs
where reversal_of_id is not null;

insert into phase2b_results
select
  'no_existing_invoice_reversal',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  count(*)::text
from public.customer_invoices
where reversal_of_id is not null;

do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_project uuid := '22222222-2222-4222-8222-2222222222a1';
  v_material uuid;
  v_id uuid;
  v_partial uuid;
  v_over uuid;
  v_undo uuid;
  v_rev uuid;
  v_sum numeric;
  v_stamp timestamptz;
begin
  select id into v_material
  from public.cost_categories
  where tenant_id = v_tenant and builtin_key = 'material';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  insert into public.project_costs (tenant_id, project_id, category_id, category, date, cost, description)
  values (v_tenant, v_project, v_material, 'material', '2026-11-02', 100, 'phase2b full')
  returning id into v_id;

  v_rev := public.reverse_project_cost(v_id, 'Full reversal', '2026-11-18', null);
  select coalesce(sum(cost), 0), max(reversed_at) filter (where id = v_id)
    into v_sum, v_stamp
  from public.project_costs
  where id = v_id or reversal_of_id = v_id;
  insert into phase2b_results values (
    'full_reversal_nets_to_zero',
    case when v_sum = 0 and v_stamp is not null and v_rev is not null then 'PASS' else 'FAIL' end,
    'sum=' || v_sum::text || ' stamped=' || coalesce(v_stamp::text, 'null')
  );

  begin
    perform public.reverse_project_cost(v_id, 'Second full', '2026-11-18', null);
    insert into phase2b_results values ('second_full_reversal_rejected', 'FAIL', 'second reversal succeeded');
  exception when others then
    insert into phase2b_results values (
      'second_full_reversal_rejected',
      case when sqlerrm ilike '%nothing left%' or sqlerrm ilike '%past zero%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  insert into public.project_costs (tenant_id, project_id, category_id, category, date, cost, description)
  values (v_tenant, v_project, v_material, 'material', '2026-11-03', 100, 'phase2b partial')
  returning id into v_partial;
  perform public.reverse_project_cost(v_partial, 'Partial forty', '2026-11-18', '{"cost": -40}'::jsonb);
  perform public.reverse_project_cost(v_partial, 'Remainder sixty', '2026-11-18', '{"cost": -60}'::jsonb);
  select coalesce(sum(cost), 0) into v_sum
  from public.project_costs
  where id = v_partial or reversal_of_id = v_partial;
  select reversed_at into v_stamp from public.project_costs where id = v_partial;
  insert into phase2b_results values (
    'partial_then_remainder',
    case when v_sum = 0 and v_stamp is not null then 'PASS' else 'FAIL' end,
    'sum=' || v_sum::text
  );

  insert into public.project_costs (tenant_id, project_id, category_id, category, date, cost, description)
  values (v_tenant, v_project, v_material, 'material', '2026-11-04', 100, 'phase2b oversize')
  returning id into v_over;
  perform public.reverse_project_cost(v_over, 'Partial forty', '2026-11-18', '{"cost": -40}'::jsonb);
  begin
    perform public.reverse_project_cost(v_over, 'Too much', '2026-11-18', '{"cost": -70}'::jsonb);
    insert into phase2b_results values ('oversize_partial_rejected', 'FAIL', 'oversize succeeded');
  exception when others then
    insert into phase2b_results values (
      'oversize_partial_rejected',
      case when sqlerrm ilike '%past zero%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  insert into public.project_costs (tenant_id, project_id, category_id, category, date, cost, description)
  values (v_tenant, v_project, v_material, 'material', '2026-11-05', 100, 'phase2b undo')
  returning id into v_undo;
  v_rev := public.reverse_project_cost(v_undo, 'Credit forty', '2026-11-18', '{"cost": -40}'::jsonb);
  perform public.reverse_project_cost(v_rev, 'Undo that credit', '2026-11-18', null);
  select coalesce(pc.cost, 0) + coalesce((
    select sum(child.cost) from public.project_costs child where child.reversal_of_id = pc.id
  ), 0)
  into v_sum
  from public.project_costs pc
  where pc.id = v_undo;
  insert into phase2b_results values (
    'reverse_a_reversal_restores_remaining',
    case when v_sum = 60 then 'PASS' else 'FAIL' end,
    v_sum::text
  );

  begin
    update public.project_costs set reversal_of_id = v_id where id = v_undo;
    insert into phase2b_results values ('client_cannot_set_reversal_link', 'FAIL', 'update succeeded');
  exception when others then
    insert into phase2b_results values (
      'client_cannot_set_reversal_link',
      case when sqlerrm ilike '%cannot be changed%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('reversal_block', 'FAIL', sqlerrm);
end $$;

do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_project uuid := '22222222-2222-4222-8222-2222222222a1';
  v_id uuid;
  v_sum numeric;
  v_collected numeric;
  v_number text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  insert into public.customer_invoices (
    tenant_id, project_id, invoice_number, amount, amount_collected, date_billed
  ) values (v_tenant, v_project, 'INV-P2B-100', 200, 80, '2026-11-02')
  returning id into v_id;

  perform public.reverse_customer_invoice(v_id, 'Credit the invoice', '2026-11-18', null);
  select coalesce(sum(amount), 0) into v_sum
  from public.customer_invoices
  where id = v_id or reversal_of_id = v_id;
  select amount_collected into v_collected from public.customer_invoices where id = v_id;
  select invoice_number into v_number
  from public.customer_invoices
  where reversal_of_id = v_id
  order by created_at desc
  limit 1;
  insert into phase2b_results values (
    'credit_memo_nets_billed_and_keeps_collected',
    case when v_sum = 0 and v_collected = 80 and v_number like 'CM-%' then 'PASS' else 'FAIL' end,
    'sum=' || v_sum::text || ' collected=' || v_collected::text || ' number=' || coalesce(v_number, 'null')
  );

  begin
    perform public.reverse_customer_invoice(v_id, 'Second credit', '2026-11-18', null);
    insert into phase2b_results values ('second_full_credit_rejected', 'FAIL', 'second credit succeeded');
  exception when others then
    insert into phase2b_results values (
      'second_full_credit_rejected',
      case when sqlerrm ilike '%nothing left%' or sqlerrm ilike '%past zero%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('credit_block', 'FAIL', sqlerrm);
end $$;

do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_id uuid;
  v_new uuid;
begin
  update public.tenants
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('books_lock_date', '2026-03-01')
  where id = v_tenant;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  begin
    update public.project_costs
    set description = 'should not stick'
    where description = 'Synthetic cost A';
    insert into phase2b_results values ('locked_cost_cannot_be_updated', 'FAIL', 'update succeeded');
  exception when others then
    insert into phase2b_results values (
      'locked_cost_cannot_be_updated',
      case when sqlerrm ilike '%closed period%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  begin
    delete from public.project_costs where description = 'Synthetic cost A';
    insert into phase2b_results values ('locked_cost_cannot_be_deleted', 'FAIL', 'delete succeeded');
  exception when others then
    insert into phase2b_results values (
      'locked_cost_cannot_be_deleted',
      case when sqlerrm ilike '%closed period%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  select id into v_id from public.project_costs where description = 'Synthetic cost A';
  v_new := public.reverse_project_cost(v_id, 'Correct a closed period', '2026-11-18', null);
  insert into phase2b_results values (
    'locked_cost_can_be_reversed',
    case when v_new is not null then 'PASS' else 'FAIL' end,
    coalesce(v_new::text, 'null')
  );

  begin
    insert into public.project_costs (
      tenant_id, project_id, category, date, cost, description
    ) values (
      v_tenant, '22222222-2222-4222-8222-2222222222a1', 'material', '2026-02-01', 10, 'dated inside the lock'
    );
    insert into phase2b_results values ('locked_date_insert_rejected', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2b_results values (
      'locked_date_insert_rejected',
      case when sqlerrm ilike '%closed period%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  insert into public.project_costs (
    tenant_id, project_id, category, date, cost, description
  ) values (
    v_tenant, '22222222-2222-4222-8222-2222222222a1', 'material', '2026-04-02', 10, 'dated after the lock'
  );
  insert into phase2b_results values ('open_date_insert_allowed', 'PASS', 'inserted');

  execute 'reset role';
  update public.tenants
  set settings = settings - 'books_lock_date'
  where id = v_tenant;
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('lock_block', 'FAIL', sqlerrm);
end $$;

do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_project uuid := '22222222-2222-4222-8222-2222222222a1';
  v_material uuid;
  v_others uuid;
  v_parent uuid;
  v_id uuid;
  v_rev uuid;
  v_category text;
  v_moved integer;
  v_both integer;
begin
  select id into v_material from public.cost_categories where tenant_id = v_tenant and builtin_key = 'material';
  select id into v_others from public.cost_categories where tenant_id = v_tenant and builtin_key = 'others';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  insert into public.project_costs (tenant_id, project_id, category_id, category, date, cost, description)
  values (v_tenant, v_project, v_material, 'material', '2026-11-06', 80, 'phase2b move')
  returning id into v_id;
  perform public.move_project_cost(v_id, v_others, 'Recode this cost');
  select category into v_category from public.project_costs where id = v_id;
  select count(*) into v_moved
  from public.record_events
  where entity_id = v_id and event_type = 'moved'
    and after_data ->> 'category_id' = v_others::text
    and before_data ->> 'category_id' = v_material::text;
  insert into phase2b_results values (
    'move_same_kind_writes_event',
    case when v_category = 'others' and v_moved = 1 then 'PASS' else 'FAIL' end,
    'category=' || coalesce(v_category, 'null') || ' events=' || v_moved::text
  );

  insert into public.project_costs (tenant_id, project_id, category_id, category, date, cost, description)
  values (v_tenant, v_project, v_material, 'material', '2026-11-07', 100, 'phase2b move pair')
  returning id into v_id;
  v_rev := public.reverse_project_cost(v_id, 'Partial before move', '2026-11-18', '{"cost": -25}'::jsonb);
  perform public.move_project_cost(v_id, v_others, 'Move the pair');
  select count(*) into v_both
  from public.project_costs
  where id in (v_id, v_rev) and category_id = v_others;
  insert into phase2b_results values (
    'move_reversed_pair_moves_both',
    case when v_both = 2 then 'PASS' else 'FAIL' end,
    v_both::text
  );

  insert into public.cost_categories (tenant_id, name, kind, sort_order)
  values (v_tenant, 'Phase2b Parent', 'standard', 410)
  returning id into v_parent;
  insert into public.cost_categories (tenant_id, name, kind, parent_id, sort_order)
  values (v_tenant, 'Phase2b Child', 'standard', v_parent, 420);
  begin
    perform public.move_project_cost(v_id, v_parent, 'Move onto a parent');
    insert into phase2b_results values ('move_to_parent_rejected', 'FAIL', 'parent move succeeded');
  exception when others then
    insert into phase2b_results values (
      'move_to_parent_rejected',
      case when sqlerrm ilike '%children%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a4","role":"authenticated","email":"viewer-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  begin
    perform public.move_project_cost(v_id, v_material, 'Viewer should not');
    insert into phase2b_results values ('move_without_write_rejected', 'FAIL', 'viewer moved it');
  exception when others then
    insert into phase2b_results values (
      'move_without_write_rejected',
      case when sqlerrm ilike '%write access%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('move_block', 'FAIL', sqlerrm);
end $$;

do $$
declare
  v_emp uuid := '44444444-4444-4444-8444-4444444444a1';
  v_project uuid := '22222222-2222-4222-8222-2222222222a1';
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_rate record;
begin
  insert into public.employee_project_rates (
    employee_id, project_id, tenant_id, effective_date, standard_rate, ot_rate, dt_rate, mob_rate
  ) values
    (v_emp, v_project, v_tenant, '2026-06-01', 99, 100, 101, 10),
    (v_emp, v_project, v_tenant, '2026-07-01', 120, 130, 140, 11);

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  select * into v_rate from public.employee_rates_as_of(v_emp, v_project, '2026-05-01');
  insert into phase2b_results values (
    'rate_without_override_uses_employee',
    case when v_rate.source = 'employee' and v_rate.standard_rate = 45 and v_rate.ot_rate = 67.50 and v_rate.dt_rate = 90
      then 'PASS' else 'FAIL' end,
    coalesce(v_rate.source, 'null') || ' st=' || coalesce(v_rate.standard_rate::text, 'null')
  );

  select * into v_rate from public.employee_rates_as_of(v_emp, v_project, '2026-06-15');
  insert into phase2b_results values (
    'rate_on_effective_date_uses_override',
    case when v_rate.source = 'override' and v_rate.standard_rate = 99 and v_rate.effective_date = '2026-06-01'
      then 'PASS' else 'FAIL' end,
    coalesce(v_rate.standard_rate::text, 'null') || ' on ' || coalesce(v_rate.effective_date::text, 'null')
  );

  select * into v_rate from public.employee_rates_as_of(v_emp, v_project, '2026-06-01');
  insert into phase2b_results values (
    'later_override_does_not_apply_earlier',
    case when v_rate.standard_rate = 99 and v_rate.effective_date = '2026-06-01' then 'PASS' else 'FAIL' end,
    coalesce(v_rate.standard_rate::text, 'null')
  );

  select * into v_rate from public.employee_rates_as_of(v_emp, v_project, '2026-07-01');
  insert into phase2b_results values (
    'later_override_applies_on_its_date',
    case when v_rate.standard_rate = 120 and v_rate.effective_date = '2026-07-01' then 'PASS' else 'FAIL' end,
    coalesce(v_rate.standard_rate::text, 'null')
  );

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('rate_block', 'FAIL', sqlerrm);
end $$;

do $$
declare
  v_visible boolean;
  v_hidden boolean;
  v_assigned boolean;
  v_change boolean;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  v_hidden := public.attachment_project_visible('not-a-real-type', '22222222-2222-4222-8222-2222222222a1');
  v_visible := public.attachment_project_visible('project', '22222222-2222-4222-8222-2222222222a1');
  v_change := public.attachment_project_visible('change_order', '33333333-3333-4333-8333-3333333333a1');
  insert into phase2b_results values (
    'attachment_unknown_type_hidden',
    case when v_hidden = false then 'PASS' else 'FAIL' end,
    coalesce(v_hidden::text, 'null')
  );
  insert into phase2b_results values (
    'attachment_visible_project_and_change_order',
    case when v_visible and v_change then 'PASS' else 'FAIL' end,
    'project=' || coalesce(v_visible::text, 'null') || ' change=' || coalesce(v_change::text, 'null')
  );
  execute 'reset role';

  update public.tenants
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('project_visibility', 'assigned')
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a3","role":"authenticated","email":"office-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  v_assigned := public.attachment_project_visible('project', '22222222-2222-4222-8222-2222222222a1');
  insert into phase2b_results values (
    'attachment_hidden_when_project_unassigned',
    case when v_assigned = false then 'PASS' else 'FAIL' end,
    coalesce(v_assigned::text, 'null')
  );
  execute 'reset role';

  update public.tenants
  set settings = settings - 'project_visibility'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('attachment_block', 'FAIL', sqlerrm);
end $$;

do $$
declare
  v_id uuid;
  i integer;
begin
  insert into public.user_invitations (tenant_id, email, role, invited_by, invitation_token)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'daily-cap@example.test', 'entry',
    '11111111-1111-4111-8111-1111111111a1', 'invite-phase2b-daily-01'
  )
  returning id into v_id;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  for i in 1..5 loop
    perform public.register_invitation_send(v_id);
  end loop;
  begin
    perform public.register_invitation_send(v_id);
    insert into phase2b_results values ('invite_daily_cap_still_enforced', 'FAIL', 'sixth send succeeded');
  exception when others then
    insert into phase2b_results values (
      'invite_daily_cap_still_enforced',
      case when sqlerrm ilike '%5 times%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';

  insert into public.user_invitations (tenant_id, email, role, invited_by, invitation_token)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'hourly-cap@example.test', 'entry',
    '11111111-1111-4111-8111-1111111111a1', 'invite-phase2b-hour-01'
  )
  returning id into v_id;
  insert into public.invitation_sends (tenant_id, invitation_id, sent_at)
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_id, now()
  from generate_series(1, 30);
  execute 'set local role authenticated';
  begin
    perform public.register_invitation_send(v_id);
    insert into phase2b_results values ('invite_hourly_cap_still_enforced', 'FAIL', 'send succeeded');
  exception when others then
    insert into phase2b_results values (
      'invite_hourly_cap_still_enforced',
      case when sqlerrm ilike '%30 sends%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('invite_block', 'FAIL', sqlerrm);
end $$;

do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_project uuid := '22222222-2222-4222-8222-2222222222a1';
  v_id uuid;
  v_events integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  insert into public.project_costs (tenant_id, project_id, category, date, cost, vendor, description)
  values (v_tenant, v_project, 'others', '2026-11-08', 12, 'Main path', 'phase2b main insert')
  returning id into v_id;
  update public.project_costs
  set description = 'phase2b main edit', updated_at = now()
  where id = v_id;
  select count(*) into v_events
  from public.record_events
  where entity_id = v_id and event_type in ('created', 'updated');
  delete from public.project_costs where id = v_id;
  execute 'reset role';
  select count(*) into v_events
  from (
    select event_type from public.record_events
    where entity_id = v_id and event_type in ('created', 'updated', 'deleted')
  ) logged;
  insert into phase2b_results values (
    'main_code_insert_update_delete',
    case when v_events = 3 and not exists (select 1 from public.project_costs where id = v_id)
      then 'PASS' else 'FAIL' end,
    'events=' || v_events::text
  );
  execute 'set local role authenticated';

  begin
    insert into public.record_events (tenant_id, entity_type, entity_id, event_type)
    values (v_tenant, 'cost', v_id, 'created');
    insert into phase2b_results values ('client_cannot_insert_events', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2b_results values (
      'client_cannot_insert_events',
      case when sqlerrm ilike '%row-level security%' or sqlerrm ilike '%permission denied%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2b_results values ('main_compat_block', 'FAIL', sqlerrm);
end $$;

select status, check_name, detail
from phase2b_results
order by status desc, check_name;

do $$
declare
  failed integer;
  total integer;
begin
  select count(*) filter (where status <> 'PASS'), count(*)
  into failed, total
  from phase2b_results;
  if failed > 0 then
    raise exception '% of % phase 2b check(s) failed', failed, total;
  end if;
  raise notice 'phase2b_checks: % passed', total;
end $$;

rollback;

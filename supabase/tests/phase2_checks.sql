-- Phase 2 checks. Run after scripts/db-local-reset.sh (snapshot, migrations, seed).
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase2_checks.sql
-- The script rolls back its own writes. A failed check raises.

begin;

create temp table phase2_results (
  check_name text primary key,
  status text not null,
  detail text
);
grant select, insert, update, delete on phase2_results to authenticated;

insert into phase2_results
select
  'baseline_acme_material',
  case when cost_sum = 250 and row_count = 1 then 'PASS' else 'FAIL' end,
  'rows=' || row_count || ' sum=' || cost_sum
from public.phase2_cost_baseline
where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and category = 'material';

insert into phase2_results
select
  'baseline_beta_material',
  case when cost_sum = 175 and row_count = 1 then 'PASS' else 'FAIL' end,
  'rows=' || row_count || ' sum=' || cost_sum
from public.phase2_cost_baseline
where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' and category = 'material';

insert into phase2_results
select
  'baseline_has_deny_policy',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  count(*)::text || ' policies'
from pg_policies
where schemaname = 'public'
  and tablename = 'phase2_cost_baseline'
  and policyname = 'phase2_cost_baseline_no_access';

insert into phase2_results
select
  'baseline_api_roles_revoked',
  case
    when not has_table_privilege('anon', 'public.phase2_cost_baseline', 'SELECT')
     and not has_table_privilege('authenticated', 'public.phase2_cost_baseline', 'SELECT')
     and not has_table_privilege('service_role', 'public.phase2_cost_baseline', 'SELECT')
    then 'PASS' else 'FAIL'
  end,
  'anon=' || has_table_privilege('anon', 'public.phase2_cost_baseline', 'SELECT')::text
    || ' authenticated=' || has_table_privilege('authenticated', 'public.phase2_cost_baseline', 'SELECT')::text
    || ' service_role=' || has_table_privilege('service_role', 'public.phase2_cost_baseline', 'SELECT')::text;

insert into phase2_results
select
  'no_null_category_id',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  count(*)::text || ' nulls'
from public.project_costs
where category_id is null;

insert into phase2_results
select
  'original_cost_amounts_kept',
  case when count(*) = 2 and sum(cost) = 425 then 'PASS' else 'FAIL' end,
  coalesce(sum(cost)::text, 'missing')
from public.project_costs
where description in ('Synthetic cost A', 'Synthetic cost B');

insert into phase2_results
select
  'budget_columns_match',
  case when count(*) filter (where pb_amount is distinct from cat_amount) = 0
            and count(*) = 14 then 'PASS' else 'FAIL' end,
  count(*)::text || ' cells, mismatches=' ||
    count(*) filter (where pb_amount is distinct from cat_amount)
from (
  select pb.project_id, v.amount as pb_amount, pcb.amount as cat_amount
  from public.project_budgets pb
  cross join lateral (
    values
      ('material', pb.material_budget),
      ('labor', pb.labor_budget),
      ('equipment', pb.equipment_budget),
      ('subcontractor', pb.subcontractor_budget),
      ('others', pb.others_budget),
      ('cap_leases', pb.cap_leases_budget),
      ('consumable', pb.consumable_budget)
  ) as v(builtin_key, amount)
  join public.cost_categories cc
    on cc.tenant_id = pb.tenant_id and cc.builtin_key = v.builtin_key
  left join public.project_category_budgets pcb
    on pcb.project_id = pb.project_id and pcb.category_id = cc.id
) s;

insert into phase2_results
select
  'permissions_match_legacy_keys',
  case when count(*) filter (where not ok) = 0 then 'PASS' else 'FAIL' end,
  count(*) filter (where not ok)::text || ' mismatches'
from (
  select
    (u.permissions -> 'categories' ->> cc.id::text) is not distinct from (u.permissions ->> legacy) as ok
  from public.users u
  join public.cost_categories cc on cc.tenant_id = u.tenant_id and cc.builtin_key is not null
  cross join lateral (
    select case cc.builtin_key when 'cap_leases' then 'capLeases' else cc.builtin_key end as legacy
  ) k
  where u.permissions ? k.legacy
) s;

insert into phase2_results
select
  'permissions_version',
  case when count(*) filter (where coalesce(permissions ->> 'version', '') <> '2') = 0
       then 'PASS' else 'FAIL' end,
  count(*)::text || ' users'
from public.users;

-- Category rules
savepoint category_rules;
do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_labor uuid;
  v_child uuid;
  v_material uuid;
  i integer;
  v_name text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  for i in 1..13 loop
    insert into public.cost_categories (tenant_id, name, kind, sort_order)
    values (v_tenant, 'Extra ' || i, 'standard', 200 + i);
  end loop;
  insert into phase2_results values ('visible_cap_allows_20', 'PASS', '13 custom added');

  begin
    insert into public.cost_categories (tenant_id, name, kind, sort_order)
    values (v_tenant, 'Extra 14', 'standard', 300);
    insert into phase2_results values ('visible_cap_rejects_21', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values (
      'visible_cap_rejects_21',
      case when sqlerrm ilike '%20 visible%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  update public.cost_categories
  set is_hidden = true
  where tenant_id = v_tenant and name = 'Extra 1';
  insert into public.cost_categories (tenant_id, name, kind, sort_order)
  values (v_tenant, 'After hide', 'standard', 301);
  insert into phase2_results values ('hidden_categories_do_not_count', 'PASS', 'inserted after hide');

  begin
    update public.cost_categories
    set is_hidden = true
    where tenant_id = v_tenant and is_hidden = false and is_builtin = false;
    update public.cost_categories
    set is_hidden = true
    where tenant_id = v_tenant and builtin_key <> 'material';
    update public.cost_categories
    set is_hidden = true
    where tenant_id = v_tenant and builtin_key = 'material';
    insert into phase2_results values ('keep_one_visible', 'FAIL', 'hid the last category');
  exception when others then
    insert into phase2_results values (
      'keep_one_visible',
      case when sqlerrm ilike '%at least one visible%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('category_rules_block', 'FAIL', sqlerrm);
end $$;
rollback to savepoint category_rules;

do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_labor uuid;
  v_child uuid;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  begin
    delete from public.cost_categories
    where tenant_id = v_tenant and builtin_key = 'material';
    insert into phase2_results values ('cannot_delete_builtin', 'FAIL', 'delete succeeded');
  exception when others then
    insert into phase2_results values (
      'cannot_delete_builtin',
      case when sqlerrm ilike '%cannot be deleted%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  begin
    insert into public.cost_categories (tenant_id, name, kind)
    values (v_tenant, 'material', 'standard');
    insert into phase2_results values ('duplicate_name_rejected', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values (
      'duplicate_name_rejected',
      case when sqlerrm ilike '%already exists%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  select id into v_labor from public.cost_categories
  where tenant_id = v_tenant and builtin_key = 'labor';
  insert into public.cost_categories (tenant_id, name, kind, parent_id)
  values (v_tenant, 'Direct Temp', 'labor', v_labor)
  returning id into v_child;
  begin
    insert into public.cost_categories (tenant_id, name, kind, parent_id)
    values (v_tenant, 'Too deep', 'labor', v_child);
    insert into phase2_results values ('third_level_rejected', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values (
      'third_level_rejected',
      case when sqlerrm ilike '%two levels%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  begin
    delete from public.cost_categories
    where tenant_id = v_tenant and builtin_key = 'labor';
    insert into phase2_results values ('cannot_delete_used_category', 'FAIL', 'delete succeeded');
  exception when others then
    insert into phase2_results values (
      'cannot_delete_used_category',
      case when sqlerrm ilike '%cannot be deleted%' or sqlerrm ilike '%subcategor%' or sqlerrm ilike '%cost entries%'
        then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('category_delete_block', 'FAIL', sqlerrm);
end $$;

-- Category permissions
savepoint category_rls;
do $$
declare
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_material uuid;
  v_labor uuid;
  v_equipment uuid;
  n integer;
  v_perms jsonb;
begin
  select id into v_material from public.cost_categories where tenant_id = v_tenant and builtin_key = 'material';
  select id into v_labor from public.cost_categories where tenant_id = v_tenant and builtin_key = 'labor';
  select id into v_equipment from public.cost_categories where tenant_id = v_tenant and builtin_key = 'equipment';

  v_perms := jsonb_build_object(
    'material', 'none',
    'labor', 'read',
    'equipment', 'write',
    'version', 2,
    'categories', jsonb_build_object(
      v_material::text, 'none',
      v_labor::text, 'read',
      v_equipment::text, 'write'
    )
  );
  update public.users set permissions = v_perms
  where id = '11111111-1111-4111-8111-1111111111a2';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a2","role":"authenticated","email":"entry-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  select count(*) into n from public.project_costs
  where project_id = '22222222-2222-4222-8222-2222222222a1' and category = 'material';
  insert into phase2_results values (
    'material_none_hides_rows',
    case when n = 0 then 'PASS' else 'FAIL' end,
    n::text || ' rows'
  );

  begin
    insert into public.project_costs (tenant_id, project_id, category, date, cost, description)
    values (v_tenant, '22222222-2222-4222-8222-2222222222a1', 'material', '2026-03-01', 1, 'blocked');
    insert into phase2_results values ('material_none_blocks_insert', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values ('material_none_blocks_insert', 'PASS', sqlerrm);
  end;

  select count(*) into n from public.project_costs where category = 'labor';
  insert into phase2_results values (
    'labor_read_can_select',
    case when n > 0 then 'PASS' else 'FAIL' end,
    n::text || ' rows'
  );

  begin
    insert into public.project_costs (tenant_id, project_id, category, date, cost, description)
    values (v_tenant, '22222222-2222-4222-8222-2222222222a1', 'labor', '2026-03-01', 1, 'blocked labor');
    insert into phase2_results values ('labor_read_blocks_insert', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values ('labor_read_blocks_insert', 'PASS', sqlerrm);
  end;

  begin
    insert into public.project_costs (tenant_id, project_id, category, date, cost, description)
    values (v_tenant, '22222222-2222-4222-8222-2222222222a1', 'equipment', '2026-03-01', 12, 'allowed equipment');
    insert into phase2_results values ('equipment_write_can_insert', 'PASS', 'inserted');
  exception when others then
    insert into phase2_results values ('equipment_write_can_insert', 'FAIL', sqlerrm);
  end;

  execute 'reset role';

  -- Legacy flat JSON, no categories map. material read, labor none.
  update public.users
  set permissions = '{"material":"read","labor":"none","equipment":"write","version":1}'::jsonb
  where id = '11111111-1111-4111-8111-1111111111a2';
  execute 'set local role authenticated';
  select count(*) into n from public.project_costs where category = 'material';
  insert into phase2_results values (
    'legacy_material_read_selects',
    case when n > 0 then 'PASS' else 'FAIL' end,
    n::text || ' rows'
  );
  begin
    insert into public.project_costs (tenant_id, project_id, category, date, cost)
    values (v_tenant, '22222222-2222-4222-8222-2222222222a1', 'material', '2026-03-02', 3);
    insert into phase2_results values ('legacy_material_read_blocks_write', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values ('legacy_material_read_blocks_write', 'PASS', sqlerrm);
  end;
  select count(*) into n from public.project_costs where category = 'labor';
  insert into phase2_results values (
    'legacy_labor_none_hides',
    case when n = 0 then 'PASS' else 'FAIL' end,
    n::text || ' rows'
  );

  execute 'reset role';
  -- Omitted built-in keys keep the pre-Phase-2 database behavior.
  update public.users
  set permissions = '{"version":2,"categories":{},"export":{}}'::jsonb
  where id = '11111111-1111-4111-8111-1111111111a2';
  execute 'set local role authenticated';
  select count(*) into n from public.project_costs where category = 'material';
  insert into phase2_results values (
    'omitted_builtin_key_still_visible',
    case when n > 0 then 'PASS' else 'FAIL' end,
    n::text || ' rows'
  );
  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('category_rls_block', 'FAIL', sqlerrm);
end $$;
rollback to savepoint category_rls;

-- Project visibility. Default "all" first, then assigned.
do $$
declare
  n integer;
  v_hidden uuid := '22222222-2222-4222-8222-2222222222a2';
  v_seen uuid := '22222222-2222-4222-8222-2222222222a1';
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a2","role":"authenticated","email":"entry-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  insert into phase2_results values (
    'default_all_pm_sees_every_project',
    case when n = 2 then 'PASS' else 'FAIL' end,
    n::text || ' projects'
  );
  select count(*) into n from public.projects where "jobNumber" = 'JOB-B-001';
  insert into phase2_results values (
    'pm_still_isolated_from_beta',
    case when n = 0 then 'PASS' else 'FAIL' end,
    n::text
  );
  execute 'reset role';

  update public.tenants
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('project_visibility', 'assigned')
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  insert into phase2_results values (
    'assigned_pm_sees_only_assigned',
    case when n = 1 then 'PASS' else 'FAIL' end,
    n::text || ' projects'
  );
  select count(*) into n from public.project_costs where project_id = v_hidden;
  insert into phase2_results values (
    'assigned_pm_hides_other_costs',
    case when n = 0 then 'PASS' else 'FAIL' end,
    n::text || ' costs'
  );
  select count(*) into n from public.customer_invoices where project_id = v_hidden;
  insert into phase2_results values (
    'assigned_pm_hides_other_invoices',
    case when n = 0 then 'PASS' else 'FAIL' end,
    n::text
  );
  begin
    insert into public.project_costs (tenant_id, project_id, category, date, cost, description)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_hidden, 'others', '2026-03-03', 5, 'hidden project'
    );
    insert into phase2_results values ('assigned_pm_cannot_post_hidden', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values ('assigned_pm_cannot_post_hidden', 'PASS', sqlerrm);
  end;
  select count(*) into n from public.project_costs where project_id = v_seen;
  insert into phase2_results values (
    'assigned_pm_sees_assigned_costs',
    case when n > 0 then 'PASS' else 'FAIL' end,
    n::text
  );
  execute 'reset role';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a4","role":"authenticated","email":"viewer-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  insert into phase2_results values (
    'assigned_viewer_sees_only_assigned',
    case when n = 1 then 'PASS' else 'FAIL' end,
    n::text || ' projects'
  );
  execute 'reset role';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into n from public.projects;
  insert into phase2_results values (
    'assigned_master_still_sees_all',
    case when n = 2 then 'PASS' else 'FAIL' end,
    n::text || ' projects'
  );
  execute 'reset role';

  update public.tenants
  set settings = settings - 'project_visibility'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('visibility_block', 'FAIL', sqlerrm);
end $$;

-- Invites
do $$
declare
  v_token text;
  v_link text;
  v_id uuid;
  v_tenant uuid;
  i integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  insert into public.user_invitations (tenant_id, email, role, permissions, invited_by, invitation_token, invite_type)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'new-person@example.test',
    'entry',
    '{"material":"read"}'::jsonb,
    '11111111-1111-4111-8111-1111111111a1',
    'invite-token-new-person-01',
    'email'
  )
  returning id, invitation_token into v_id, v_token;

  for i in 1..5 loop
    perform public.register_invitation_send(v_id);
  end loop;
  begin
    perform public.register_invitation_send(v_id);
    insert into phase2_results values ('invite_resend_daily_cap', 'FAIL', 'sixth send succeeded');
  exception when others then
    insert into phase2_results values (
      'invite_resend_daily_cap',
      case when sqlerrm ilike '%5 times%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-1111111111e1',
    'authenticated', 'authenticated', 'new-person@example.test', 'x', now(), now()
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111e1","role":"authenticated","email":"new-person@example.test","user_metadata":{"name":"New Person"}}',
    true
  );
  execute 'set local role authenticated';
  perform public.accept_tenant_invitation(v_token);
  select tenant_id into v_tenant from public.users where id = '11111111-1111-4111-8111-1111111111e1';
  insert into phase2_results values (
    'email_invite_creates_profile_and_joins',
    case when v_tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' then 'PASS' else 'FAIL' end,
    coalesce(v_tenant::text, 'no profile')
  );
  execute 'reset role';

  -- Someone who already belongs to Beta cannot take the Acme link.
  execute 'set local role postgres';
  insert into public.user_invitations (tenant_id, email, role, invited_by, invitation_token, invite_type, max_uses)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, 'view',
    '11111111-1111-4111-8111-1111111111a1', 'invite-link-once-0001', 'link', 1
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111d1","role":"authenticated","email":"solo@example.test"}',
    true
  );
  execute 'set local role authenticated';
  perform public.accept_tenant_invitation('invite-link-once-0001');
  insert into phase2_results values ('link_invite_first_use', 'PASS', 'joined');
  begin
    perform set_config(
      'request.jwt.claims',
      '{"sub":"11111111-1111-4111-8111-1111111111e1","role":"authenticated","email":"new-person@example.test"}',
      true
    );
    -- new-person already joined Acme above, so this is "already a member" OR max uses.
    perform public.accept_tenant_invitation('invite-link-once-0001');
    insert into phase2_results values ('link_invite_stops_at_max_uses', 'FAIL', 'second use succeeded');
  exception when others then
    insert into phase2_results values (
      'link_invite_stops_at_max_uses',
      case when sqlerrm ilike '%maximum%' or sqlerrm ilike '%already%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';

  update public.user_invitations
  set status = 'revoked', revoked_at = now()
  where invitation_token = 'invite-link-once-0001';
  -- A fresh link that is expired.
  insert into public.user_invitations (
    tenant_id, email, role, invited_by, invitation_token, invite_type, status, expires_at
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'late@example.test', 'entry',
    '11111111-1111-4111-8111-1111111111a1', 'invite-expired-token-1', 'email', 'pending', now() - interval '1 day'
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111d2","role":"authenticated","email":"late@example.test"}',
    true
  );
  -- ghost auth user has no profile. Give them the expired invite's email via jwt only.
  execute 'set local role authenticated';
  begin
    perform public.accept_tenant_invitation('invite-expired-token-1');
    insert into phase2_results values ('expired_invite_rejected', 'FAIL', 'accepted');
  exception when others then
    insert into phase2_results values (
      'expired_invite_rejected',
      case when sqlerrm ilike '%expired%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';

  insert into public.user_invitations (
    tenant_id, email, role, invited_by, invitation_token, invite_type, status, revoked_at
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'late@example.test', 'entry',
    '11111111-1111-4111-8111-1111111111a1', 'invite-revoked-token-1', 'email', 'revoked', now()
  );
  execute 'set local role authenticated';
  begin
    perform public.accept_tenant_invitation('invite-revoked-token-1');
    insert into phase2_results values ('revoked_invite_rejected', 'FAIL', 'accepted');
  exception when others then
    insert into phase2_results values (
      'revoked_invite_rejected',
      case when sqlerrm ilike '%revoked%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111b1","role":"authenticated","email":"master-b@example.test"}',
    true
  );
  insert into public.user_invitations (
    tenant_id, email, role, invited_by, invitation_token, invite_type, expires_at
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'master-b@example.test', 'entry',
    '11111111-1111-4111-8111-1111111111a1', 'invite-other-tenant-01', 'email', now() + interval '3 days'
  );
  execute 'set local role authenticated';
  begin
    perform public.accept_tenant_invitation('invite-other-tenant-01');
    insert into phase2_results values ('other_tenant_rejected', 'FAIL', 'joined');
  exception when others then
    insert into phase2_results values (
      'other_tenant_rejected',
      case when sqlerrm ilike '%another organization%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('invite_block', 'FAIL', sqlerrm);
end $$;

-- Hourly company cap: 30 existing sends, the next one fails.
do $$
declare
  v_id uuid;
  i integer;
begin
  insert into public.user_invitations (tenant_id, email, role, invited_by, invitation_token)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'burst@example.test', 'entry',
    '11111111-1111-4111-8111-1111111111a1', 'invite-burst-token-001'
  )
  returning id into v_id;
  insert into public.invitation_sends (tenant_id, invitation_id, sent_at)
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', v_id, now()
  from generate_series(1, 30);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  begin
    perform public.register_invitation_send(v_id);
    insert into phase2_results values ('invite_hourly_cap', 'FAIL', '31st send succeeded');
  exception when others then
    insert into phase2_results values (
      'invite_hourly_cap',
      case when sqlerrm ilike '%30 sends%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('hourly_block', 'FAIL', sqlerrm);
end $$;

-- Last master
savepoint last_master;
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  begin
    update public.users set role = 'entry'
    where id = '11111111-1111-4111-8111-1111111111a1';
    insert into phase2_results values ('last_master_protected', 'FAIL', 'demotion succeeded');
  exception when others then
    insert into phase2_results values (
      'last_master_protected',
      case when sqlerrm ilike '%at least one active master%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;

  insert into public.users (id, tenant_id, name, email, role, is_active)
  values (
    '11111111-1111-4111-8111-1111111111a9',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Second Master', 'second-master@example.test', 'master', true
  );
  update public.users set is_active = false
  where id = '11111111-1111-4111-8111-1111111111a1';
  insert into phase2_results values ('second_master_can_remain', 'PASS', 'first master deactivated');
exception when others then
  insert into phase2_results values ('last_master_block', 'FAIL', sqlerrm);
end $$;
rollback to savepoint last_master;

-- Labor split and the 20-category interaction
savepoint labor_split;
do $$
declare
  n integer;
  i integer;
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  perform public.set_labor_split(true);
  select count(*) into n
  from public.cost_categories
  where tenant_id = v_tenant
    and lower(name) in ('direct labor', 'indirect labor')
    and is_hidden = false
    and parent_id is not null;
  insert into phase2_results values (
    'labor_split_on_creates_children',
    case when n = 2 then 'PASS' else 'FAIL' end,
    n::text
  );
  perform public.set_labor_split(false);
  select count(*) into n
  from public.cost_categories
  where tenant_id = v_tenant
    and lower(name) in ('direct labor', 'indirect labor')
    and is_hidden = false;
  insert into phase2_results values (
    'labor_split_off_hides_children',
    case when n = 0 then 'PASS' else 'FAIL' end,
    n::text || ' still visible'
  );

  -- 7 builtins + 12 custom = 19. Turning the split on wants 2 more.
  for i in 1..12 loop
    insert into public.cost_categories (tenant_id, name, kind, sort_order)
    values (v_tenant, 'Fill ' || i, 'standard', 400 + i);
  end loop;
  begin
    perform public.set_labor_split(true);
    insert into phase2_results values ('labor_split_respects_cap', 'FAIL', 'split turned on');
  exception when others then
    insert into phase2_results values (
      'labor_split_respects_cap',
      case when sqlerrm ilike '%20 visible%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('labor_split_block', 'FAIL', sqlerrm);
end $$;
rollback to savepoint labor_split;

do $$
declare
  i integer;
  v_tenant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  update public.labor_field_definitions
  set is_enabled = true
  where tenant_id = v_tenant and preset_key in ('cost_code', 'crew', 'shift', 'billable');
  insert into public.labor_field_definitions (tenant_id, label, field_type, is_enabled, sort_order)
  values (v_tenant, 'Truck', 'text', true, 50);
  begin
    insert into public.labor_field_definitions (tenant_id, label, field_type, is_enabled, sort_order)
    values (v_tenant, 'Foreman', 'text', true, 60);
    insert into phase2_results values ('sixth_labor_field_rejected', 'FAIL', 'insert succeeded');
  exception when others then
    insert into phase2_results values (
      'sixth_labor_field_rejected',
      case when sqlerrm ilike '%5 labor fields%' then 'PASS' else 'FAIL' end,
      sqlerrm
    );
  end;
  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('labor_field_block', 'FAIL', sqlerrm);
end $$;

-- Old-style cost insert still fills category_id. New-style fills category text.
do $$
declare
  v_id uuid;
  v_cat uuid;
  v_text text;
  v_custom uuid;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';
  insert into public.project_costs (tenant_id, project_id, category, date, cost, description)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '22222222-2222-4222-8222-2222222222a1',
    'consumable', '2026-04-01', 8, 'legacy insert'
  )
  returning id, category_id into v_id, v_cat;
  insert into phase2_results values (
    'legacy_insert_fills_category_id',
    case when v_cat is not null then 'PASS' else 'FAIL' end,
    coalesce(v_cat::text, 'null')
  );

  insert into public.cost_categories (tenant_id, name, kind)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Hauling', 'standard')
  returning id into v_custom;
  insert into public.project_costs (tenant_id, project_id, category_id, date, cost, description, category)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '22222222-2222-4222-8222-2222222222a1',
    v_custom, '2026-04-02', 15, 'custom insert', 'material'
  )
  returning category into v_text;
  insert into phase2_results values (
    'custom_insert_sets_legacy_category',
    case when v_text = 'others' then 'PASS' else 'FAIL' end,
    coalesce(v_text, 'null')
  );
  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into phase2_results values ('sync_block', 'FAIL', sqlerrm);
end $$;

insert into phase2_results
select 'invoice_collected_column',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_invoices'
      and column_name = 'amount_collected'
  ) then 'PASS' else 'FAIL' end,
  'amount_collected';

select status, check_name, detail
from phase2_results
order by status desc, check_name;

do $$
declare
  failed integer;
  total integer;
begin
  select count(*) filter (where status <> 'PASS'), count(*)
  into failed, total
  from phase2_results;
  if failed > 0 then
    raise exception '% of % phase 2 check(s) failed', failed, total;
  end if;
  raise notice 'phase2_checks: % passed', total;
end $$;

rollback;

-- Proves the RLS migration against the synthetic ProTrack-Prod snapshot.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
-- The script rolls back its own writes. A failed check raises and exits non-zero.
-- Applying the two migration files twice (requirement d) is a separate psql
-- step: this file runs inside one transaction and cannot commit those files.
--
-- Expected data (from the snapshot seed):
--   acme  aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1
--   beta  aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2
--   acme master 11111111-1111-4111-8111-1111111111a1  master-a@example.test
--   acme entry  11111111-1111-4111-8111-1111111111a2  entry-a@example.test
--   beta master 11111111-1111-4111-8111-1111111111b1  master-b@example.test

begin;

create temp table rls_results (
  check_name text primary key,
  status text not null,
  detail text
);
grant select, insert, update, delete on rls_results to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (a) anon cannot read or write users, tenants, or tenant data
-- ---------------------------------------------------------------------------

do $$
declare
  n integer;
  status text;
  detail text;
  target text;
begin
  foreach target in array array['users', 'tenants', 'projects', 'project_costs', 'customer_invoices']
  loop
    begin
      execute 'set local role anon';
      execute format('select count(*) from public.%I', target) into n;
      if n = 0 then
        status := 'PASS'; detail := '0 rows';
      else
        status := 'FAIL'; detail := n::text || ' rows';
      end if;
    exception
      when insufficient_privilege then
        status := 'PASS'; detail := 'permission denied';
      when others then
        status := 'FAIL'; detail := sqlerrm;
    end;
    execute 'reset role';
    insert into rls_results values ('anon_read_' || target, status, detail);
  end loop;
end $$;

do $$
declare
  status text;
  detail text;
begin
  begin
    execute 'set local role anon';
    insert into public.users (name, email, role) values ('Anon', 'anon@example.test', 'entry');
    status := 'FAIL'; detail := 'insert succeeded';
  exception
    when insufficient_privilege then
      status := 'PASS'; detail := 'permission denied';
    when others then
      status := 'FAIL'; detail := sqlerrm;
  end;
  execute 'reset role';
  insert into rls_results values ('anon_insert_users', status, detail);
end $$;

do $$
declare
  status text;
  detail text;
begin
  begin
    execute 'set local role anon';
    insert into public.tenants (subdomain, name, email)
    values ('anon-co', 'Anon Co', 'anon@example.test');
    status := 'FAIL'; detail := 'insert succeeded';
  exception
    when insufficient_privilege then
      status := 'PASS'; detail := 'permission denied';
    when others then
      status := 'FAIL'; detail := sqlerrm;
  end;
  execute 'reset role';
  insert into rls_results values ('anon_insert_tenants', status, detail);
end $$;

do $$
declare
  status text;
  detail text;
begin
  begin
    execute 'set local role anon';
    insert into public.projects (tenant_id, "jobNumber", "jobName", customer)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'JOB-ANON', 'Anon Job', 'Anon');
    status := 'FAIL'; detail := 'insert succeeded';
  exception
    when insufficient_privilege then
      status := 'PASS'; detail := 'permission denied';
    when others then
      status := 'FAIL'; detail := sqlerrm;
  end;
  execute 'reset role';
  insert into rls_results values ('anon_insert_projects', status, detail);
end $$;

-- ---------------------------------------------------------------------------
-- (b) tenant A can use its own rows and sees nothing from tenant B
-- Signed in as the Acme entry user.
-- ---------------------------------------------------------------------------

do $$
declare
  n integer;
  status text;
  detail text;
  new_project uuid;
  new_cost uuid;
  new_invoice uuid;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a2","role":"authenticated","email":"entry-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  select count(*) into n from public.users where id = '11111111-1111-4111-8111-1111111111a2';
  if n = 1 then
    insert into rls_results values ('entry_a_profile_by_id', 'PASS', '1 row');
  else
    insert into rls_results values ('entry_a_profile_by_id', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.users where lower(email) = 'entry-a@example.test';
  if n = 1 then
    insert into rls_results values ('entry_a_profile_by_email', 'PASS', '1 row');
  else
    insert into rls_results values ('entry_a_profile_by_email', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.users where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  if n = 0 then
    insert into rls_results values ('entry_a_sees_no_beta_users', 'PASS', '0 rows');
  else
    insert into rls_results values ('entry_a_sees_no_beta_users', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.projects;
  if n = 1 then
    insert into rls_results values ('entry_a_project_count', 'PASS', '1 row');
  else
    insert into rls_results values ('entry_a_project_count', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.projects where "jobNumber" = 'JOB-B-001';
  if n = 0 then
    insert into rls_results values ('entry_a_no_beta_project', 'PASS', '0 rows');
  else
    insert into rls_results values ('entry_a_no_beta_project', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.project_costs;
  if n = 1 then
    insert into rls_results values ('entry_a_cost_count', 'PASS', '1 row');
  else
    insert into rls_results values ('entry_a_cost_count', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.customer_invoices;
  if n = 1 then
    insert into rls_results values ('entry_a_invoice_count', 'PASS', '1 row');
  else
    insert into rls_results values ('entry_a_invoice_count', 'FAIL', n::text || ' rows');
  end if;

  begin
    insert into public.projects (tenant_id, "jobNumber", "jobName", customer, "totalContractValue")
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'JOB-A-NEW', 'Acme Added', 'Acme Customer', 10)
    returning id into new_project;
    update public.projects set customer = 'Acme Customer Updated' where id = new_project;
    insert into rls_results values ('entry_a_write_project', 'PASS', new_project::text);
  exception when others then
    insert into rls_results values ('entry_a_write_project', 'FAIL', sqlerrm);
  end;

  begin
    insert into public.projects (tenant_id, "jobNumber", "jobName", customer)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'JOB-A-STEAL', 'Stolen', 'Beta');
    insert into rls_results values ('entry_a_cannot_write_beta_project', 'FAIL', 'insert succeeded');
  exception
    when insufficient_privilege then
      insert into rls_results values ('entry_a_cannot_write_beta_project', 'PASS', 'permission denied');
    when others then
      insert into rls_results values ('entry_a_cannot_write_beta_project', 'FAIL', sqlerrm);
  end;

  begin
    insert into public.project_costs (tenant_id, project_id, category, date, cost, description)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '22222222-2222-4222-8222-2222222222a1',
      'labor', '2026-02-01', 80, 'Entry labor'
    )
    returning id into new_cost;
    update public.project_costs set cost = 90 where id = new_cost;
    insert into rls_results values ('entry_a_write_cost', 'PASS', new_cost::text);
  exception when others then
    insert into rls_results values ('entry_a_write_cost', 'FAIL', sqlerrm);
  end;

  begin
    insert into public.customer_invoices (tenant_id, project_id, invoice_number, amount, date_billed)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '22222222-2222-4222-8222-2222222222a1',
      'INV-A-NEW', 25, '2026-02-02'
    )
    returning id into new_invoice;
    update public.customer_invoices set amount = 30 where id = new_invoice;
    insert into rls_results values ('entry_a_write_invoice', 'PASS', new_invoice::text);
  exception when others then
    insert into rls_results values ('entry_a_write_invoice', 'FAIL', sqlerrm);
  end;

  begin
    update public.users
    set role = 'master'
    where id = '11111111-1111-4111-8111-1111111111a1';
    if found then
      insert into rls_results values ('entry_a_cannot_promote_master', 'FAIL', 'update succeeded');
    else
      insert into rls_results values ('entry_a_cannot_promote_master', 'PASS', '0 rows updated');
    end if;
  exception
    when insufficient_privilege then
      insert into rls_results values ('entry_a_cannot_promote_master', 'PASS', 'permission denied');
    when others then
      insert into rls_results values ('entry_a_cannot_promote_master', 'FAIL', sqlerrm);
  end;

  begin
    update public.users set name = 'Acme Entry Renamed'
    where id = '11111111-1111-4111-8111-1111111111a2';
    if found then
      insert into rls_results values ('entry_a_update_own_name', 'PASS', 'updated');
    else
      insert into rls_results values ('entry_a_update_own_name', 'FAIL', '0 rows');
    end if;
  exception when others then
    insert into rls_results values ('entry_a_update_own_name', 'FAIL', sqlerrm);
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into rls_results values ('entry_a_block', 'FAIL', sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- (c) master / manager behavior, email fallback, change orders, storage
-- ---------------------------------------------------------------------------

do $$
declare
  n integer;
  new_co uuid;
  status text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  select count(*) into n from public.users where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if n = 3 then
    insert into rls_results values ('master_a_lists_tenant_users', 'PASS', n::text || ' rows');
  else
    insert into rls_results values ('master_a_lists_tenant_users', 'FAIL', n::text || ' rows');
  end if;

  begin
    update public.users set is_active = false
    where id = '11111111-1111-4111-8111-1111111111a3';
    if found then
      insert into rls_results values ('master_a_updates_coworker', 'PASS', 'updated');
    else
      insert into rls_results values ('master_a_updates_coworker', 'FAIL', '0 rows');
    end if;
  exception when others then
    insert into rls_results values ('master_a_updates_coworker', 'FAIL', sqlerrm);
  end;

  begin
    insert into public.change_orders (project_id, tenant_id, name, additional_contract_value)
    values (
      '22222222-2222-4222-8222-2222222222a1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'Acme CO', 500
    )
    returning id into new_co;
    insert into public.change_order_budgets (change_order_id, category, budget)
    values (new_co, 'labor', 100);
    insert into rls_results values ('master_a_change_order', 'PASS', new_co::text);
  exception when others then
    insert into rls_results values ('master_a_change_order', 'FAIL', sqlerrm);
  end;

  begin
    insert into public.user_invitations (tenant_id, email, role, invited_by)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'new-hire@example.test',
      'entry',
      '11111111-1111-4111-8111-1111111111a1'
    );
    insert into rls_results values ('master_a_create_invitation', 'PASS', 'inserted');
  exception when others then
    insert into rls_results values ('master_a_create_invitation', 'FAIL', sqlerrm);
  end;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into rls_results values ('master_a_block', 'FAIL', sqlerrm);
end $$;

-- Legacy profile: auth id has no users row, email matches exactly one profile.
insert into public.users (id, tenant_id, name, email, role, permissions, is_active)
values (
  '11111111-1111-4111-8111-1111111111c9',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Legacy Acme',
  'legacy-a@example.test',
  'master',
  '{}'::jsonb,
  true
);

do $$
declare
  n integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111c1","role":"authenticated","email":"legacy-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  select count(*) into n from public.users where id = '11111111-1111-4111-8111-1111111111c1';
  if n = 0 then
    insert into rls_results values ('legacy_no_row_for_auth_id', 'PASS', '0 rows');
  else
    insert into rls_results values ('legacy_no_row_for_auth_id', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.users where lower(email) = 'legacy-a@example.test';
  if n = 1 then
    insert into rls_results values ('legacy_email_fallback_lookup', 'PASS', '1 row');
  else
    insert into rls_results values ('legacy_email_fallback_lookup', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.projects where "jobNumber" = 'JOB-A-001';
  if n = 1 then
    insert into rls_results values ('legacy_sees_own_tenant_project', 'PASS', '1 row');
  else
    insert into rls_results values ('legacy_sees_own_tenant_project', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n from public.projects where "jobNumber" = 'JOB-B-001';
  if n = 0 then
    insert into rls_results values ('legacy_sees_no_beta_project', 'PASS', '0 rows');
  else
    insert into rls_results values ('legacy_sees_no_beta_project', 'FAIL', n::text || ' rows');
  end if;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into rls_results values ('legacy_block', 'FAIL', sqlerrm);
end $$;

-- Attachments table row and storage object path.
do $$
declare
  n integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a2","role":"authenticated","email":"entry-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  begin
    insert into public.attachments (
      tenant_id, entity_type, entity_id, file_name, file_size, file_type, storage_path, uploaded_by
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'projects',
      '22222222-2222-4222-8222-2222222222a1',
      'note.txt',
      12,
      'text/plain',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/projects/22222222-2222-4222-8222-2222222222a1/note.txt',
      '11111111-1111-4111-8111-1111111111a2'
    );
    insert into rls_results values ('entry_a_attachment_row', 'PASS', 'inserted');
  exception when others then
    insert into rls_results values ('entry_a_attachment_row', 'FAIL', sqlerrm);
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values (
      'attachments',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/projects/22222222-2222-4222-8222-2222222222a1/note.txt'
    );
    insert into rls_results values ('entry_a_storage_own_path', 'PASS', 'inserted');
  exception when others then
    insert into rls_results values ('entry_a_storage_own_path', 'FAIL', sqlerrm);
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values (
      'attachments',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/projects/22222222-2222-4222-8222-2222222222b1/note.txt'
    );
    insert into rls_results values ('entry_a_storage_other_path', 'FAIL', 'insert succeeded');
  exception
    when insufficient_privilege then
      insert into rls_results values ('entry_a_storage_other_path', 'PASS', 'permission denied');
    when others then
      insert into rls_results values ('entry_a_storage_other_path', 'FAIL', sqlerrm);
  end;

  select count(*) into n
  from storage.objects
  where bucket_id = 'attachments'
    and name like 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/%';
  if n >= 1 then
    insert into rls_results values ('entry_a_storage_read_own', 'PASS', n::text || ' rows');
  else
    insert into rls_results values ('entry_a_storage_read_own', 'FAIL', n::text || ' rows');
  end if;

  select count(*) into n
  from storage.objects
  where bucket_id = 'attachments'
    and name like 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/%';
  if n = 0 then
    insert into rls_results values ('entry_a_storage_read_other', 'PASS', '0 rows');
  else
    insert into rls_results values ('entry_a_storage_read_other', 'FAIL', n::text || ' rows');
  end if;

  execute 'reset role';
exception when others then
  execute 'reset role';
  insert into rls_results values ('storage_block', 'FAIL', sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- Privileges, RLS flags, policy shape, view, search_path
-- ---------------------------------------------------------------------------

do $$
declare
  ok boolean;
begin
  select has_column_privilege('anon', 'public.users', 'password_hash', 'SELECT') into ok;
  insert into rls_results values (
    'anon_password_hash_select',
    case when ok then 'FAIL' else 'PASS' end,
    'has_column_privilege=' || ok::text
  );
  select has_column_privilege('authenticated', 'public.users', 'password_hash', 'SELECT') into ok;
  insert into rls_results values (
    'authenticated_password_hash_select',
    case when ok then 'FAIL' else 'PASS' end,
    'has_column_privilege=' || ok::text
  );
end $$;

do $$
declare
  status text;
  detail text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  begin
    execute 'set local role authenticated';
    perform password_hash from public.users limit 1;
    status := 'FAIL'; detail := 'select succeeded';
  exception
    when insufficient_privilege then
      status := 'PASS'; detail := 'permission denied';
    when others then
      status := 'FAIL'; detail := sqlerrm;
  end;
  execute 'reset role';
  insert into rls_results values ('authenticated_select_password_hash', status, detail);
end $$;

insert into rls_results
select
  'rls_enabled_' || relname,
  case when relrowsecurity then 'PASS' else 'FAIL' end,
  'relrowsecurity=' || relrowsecurity::text
from pg_class
where oid in ('public.users'::regclass, 'public.tenants'::regclass);

insert into rls_results
select
  'no_public_policies',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  count(*)::text || ' policies still apply to public'
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and cardinality(p.polroles) = 0;

insert into rls_results
select
  'user_invitations_table',
  case when to_regclass('public.user_invitations') is null then 'FAIL' else 'PASS' end,
  coalesce(to_regclass('public.user_invitations')::text, 'missing');

insert into rls_results
select
  'view_security_invoker',
  case
    when exists (
      select 1 from pg_class
      where oid = 'public.user_management_view'::regclass
        and reloptions @> array['security_invoker=true']
    ) then 'PASS'
    else 'FAIL'
  end,
  coalesce((
    select reloptions::text from pg_class
    where oid = 'public.user_management_view'::regclass
  ), 'missing');

insert into rls_results
select
  'anon_cannot_read_view',
  case when has_table_privilege('anon', 'public.user_management_view', 'SELECT')
    then 'FAIL' else 'PASS' end,
  'has_table_privilege=' || has_table_privilege('anon', 'public.user_management_view', 'SELECT')::text;

insert into rls_results
select
  'search_path_' || p.proname,
  case
    when p.proconfig is not null and exists (
      select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
    ) then 'PASS'
    else 'FAIL'
  end,
  coalesce(p.proconfig::text, 'null')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_current_user_tenant_id',
    'is_current_user_master',
    'send_user_invitation',
    'update_updated_at_column',
    'user_can_access_tenant',
    'get_tenant_id_from_project'
  );

insert into rls_results
select
  'anon_execute_' || p.proname,
  case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'FAIL' else 'PASS' end,
  'execute=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_current_user_tenant_id',
    'is_current_user_master',
    'send_user_invitation',
    'update_updated_at_column',
    'user_can_access_tenant',
    'get_tenant_id_from_project',
    'current_tenant_id',
    'create_workspace',
    'accept_tenant_invitation'
  );

select status, check_name, detail
from rls_results
order by status desc, check_name;

do $$
declare
  failed integer;
begin
  select count(*) into failed from rls_results where status <> 'PASS';
  if failed > 0 then
    raise exception '% RLS check(s) failed', failed;
  end if;
end $$;

rollback;

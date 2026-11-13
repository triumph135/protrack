-- Rolls back 20260313000000_enable_rls.sql and 20260313000001_storage_rls.sql
-- to the ProTrack-Prod shape captured on 2026-11-13.
--
-- Run in the Supabase SQL editor as one script. One transaction.
--
-- What it puts back:
-- - The original public policies (including policies that apply to anon).
-- - RLS off on public.users and public.tenants. RLS stays on for the other
--   tables, which already had it.
-- - anon table grants, including SELECT on users.password_hash.
-- - user_management_view as a security-definer view that joins auth.users.
-- - The six original functions with no pinned search_path, executable by anon.
-- - The three original attachments storage policies. The UPDATE policy is removed.
--
-- What it deletes:
-- - public.user_invitations, if this migration created it. Invitation rows
--   stored only in that table are removed.
-- - The helper functions and workspace/invitation RPCs added by the migration.
--
-- Do not run this on a database that has not had the forward migration applied
-- unless you intend to replace its public policies with the 2026-11-13 set.

begin;

-- Storage policies call current_tenant_id(). Drop them before that function.
drop policy if exists attachments_storage_select on storage.objects;
drop policy if exists attachments_storage_insert on storage.objects;
drop policy if exists attachments_storage_update on storage.objects;
drop policy if exists attachments_storage_delete on storage.objects;

-- Public policies first so the functions they call can be dropped.
do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name, p.polname as policy_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    execute format('drop policy %I on public.%I', r.policy_name, r.table_name);
  end loop;
end $$;

drop function if exists public.create_workspace(text, text, text, text, text);
drop function if exists public.accept_tenant_invitation(text);
drop function if exists public.current_tenant_id();
drop function if exists public.current_user_role();
drop function if exists public.current_user_permissions();
drop function if exists public.has_users_write();
drop function if exists public.is_master();
drop function if exists public.current_profile_id();
drop function if exists public.current_user_email();

drop table if exists public.user_invitations;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.get_current_user_tenant_id()',
    'public.is_current_user_master()',
    'public.user_can_access_tenant(uuid)',
    'public.get_tenant_id_from_project(uuid)',
    'public.send_user_invitation(text, uuid, text, text)',
    'public.update_updated_at_column()'
  ]
  loop
    if to_regprocedure(fn) is null then
      continue;
    end if;
    execute format('alter function %s reset search_path', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end $$;

-- Original policies, copied from the 2026-11-13 production snapshot.
-- All are PERMISSIVE and TO public.

create policy "Master users can update their tenant" on public.tenants
  for update to public
  using (((id = get_current_user_tenant_id()) and is_current_user_master()));

create policy "Users can view their own tenant" on public.tenants
  for select to public
  using ((id = get_current_user_tenant_id()));

create policy "Master users can create users in their tenant" on public.users
  for insert to public
  with check ((((tenant_id = get_current_user_tenant_id()) and is_current_user_master()) or (tenant_id is null)));

create policy "Master users can delete users in their tenant" on public.users
  for delete to public
  using (((tenant_id = get_current_user_tenant_id()) and is_current_user_master()));

create policy "Users can update own profile" on public.users
  for update to public
  using ((auth.uid() = id));

create policy "Users can update profiles appropriately" on public.users
  for update to public
  using (((id = auth.uid()) or ((tenant_id = get_current_user_tenant_id()) and is_current_user_master())));

create policy "Users can update themselves" on public.users
  for update to public
  using ((id = auth.uid()));

create policy "Users can view own profile" on public.users
  for select to public
  using ((auth.uid() = id));

create policy "Users can view their own record and tenant users" on public.users
  for select to public
  using (((id = auth.uid()) or ((tenant_id is not null) and (tenant_id = (select users_1.tenant_id from users users_1 where (users_1.id = auth.uid()) limit 1)))));

create policy "Users can view users in their tenant" on public.users
  for select to public
  using (((tenant_id = get_current_user_tenant_id()) or (id = auth.uid()) or (tenant_id is null)));

create policy "Users can create attachments in their tenant" on public.attachments
  for insert to public
  with check ((tenant_id = get_current_user_tenant_id()));

create policy "Users can delete their own attachments, masters can delete any" on public.attachments
  for delete to public
  using (((tenant_id = get_current_user_tenant_id()) and ((uploaded_by = auth.uid()) or is_current_user_master())));

create policy "Users can update attachments in their tenant" on public.attachments
  for update to public
  using (((tenant_id = get_current_user_tenant_id()) and ((uploaded_by = auth.uid()) or is_current_user_master())));

create policy "Users can view attachments in their tenant" on public.attachments
  for select to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "No deletes on audit logs" on public.audit_logs
  for delete to public
  using (false);

create policy "No updates on audit logs" on public.audit_logs
  for update to public
  using (false);

create policy "System can insert audit logs" on public.audit_logs
  for insert to public
  with check (true);

create policy "Users can view audit logs in their tenant" on public.audit_logs
  for select to public
  using (((tenant_id = get_current_user_tenant_id()) or (tenant_id is null)));

create policy "Master users can delete customer invoices in their tenant" on public.customer_invoices
  for delete to public
  using (((tenant_id = get_current_user_tenant_id()) and is_current_user_master()));

create policy "Users can create customer invoices in their tenant" on public.customer_invoices
  for insert to public
  with check (((tenant_id = get_current_user_tenant_id()) and (get_tenant_id_from_project(project_id) = tenant_id)));

create policy "Users can update customer invoices in their tenant" on public.customer_invoices
  for update to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can view customer invoices in their tenant" on public.customer_invoices
  for select to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Master users can delete employees in their tenant" on public.employees
  for delete to public
  using (((tenant_id = get_current_user_tenant_id()) and is_current_user_master()));

create policy "Users can create employees in their tenant" on public.employees
  for insert to public
  with check ((tenant_id = get_current_user_tenant_id()));

create policy "Users can update employees in their tenant" on public.employees
  for update to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can view employees in their tenant" on public.employees
  for select to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Master users can delete projects in their tenant" on public.projects
  for delete to public
  using (((tenant_id = get_current_user_tenant_id()) and is_current_user_master()));

create policy "Users can create projects in their tenant" on public.projects
  for insert to public
  with check ((tenant_id = get_current_user_tenant_id()));

create policy "Users can update projects in their tenant" on public.projects
  for update to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can view projects in their tenant" on public.projects
  for select to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Master users can delete change order budgets through their tena" on public.change_order_budgets
  for delete to public
  using (((change_order_id in (select change_orders.id from change_orders where (change_orders.tenant_id = get_current_user_tenant_id()))) and is_current_user_master()));

create policy "Users can create change order budgets through their tenant" on public.change_order_budgets
  for insert to public
  with check ((change_order_id in (select change_orders.id from change_orders where (change_orders.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update change order budgets through their tenant" on public.change_order_budgets
  for update to public
  using ((change_order_id in (select change_orders.id from change_orders where (change_orders.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view change order budgets through their tenant" on public.change_order_budgets
  for select to public
  using ((change_order_id in (select change_orders.id from change_orders where (change_orders.tenant_id = get_current_user_tenant_id()))));

create policy "Master users can delete change orders in their tenant" on public.change_orders
  for delete to public
  using (((tenant_id = get_current_user_tenant_id()) and is_current_user_master()));

create policy "Users can create change orders in their tenant" on public.change_orders
  for insert to public
  with check (((tenant_id = get_current_user_tenant_id()) and (get_tenant_id_from_project(project_id) = tenant_id)));

create policy "Users can update change orders in their tenant" on public.change_orders
  for update to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can view change orders in their tenant" on public.change_orders
  for select to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Master users can delete project budgets in their tenant" on public.project_budgets
  for delete to public
  using (((tenant_id = get_current_user_tenant_id()) and is_current_user_master()));

create policy "Users can create project budgets in their tenant" on public.project_budgets
  for insert to public
  with check (((tenant_id = get_current_user_tenant_id()) and (get_tenant_id_from_project(project_id) = tenant_id)));

create policy "Users can update project budgets in their tenant" on public.project_budgets
  for update to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can view project budgets in their tenant" on public.project_budgets
  for select to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can create project costs in their tenant" on public.project_costs
  for insert to public
  with check (((tenant_id = get_current_user_tenant_id()) and (get_tenant_id_from_project(project_id) = tenant_id)));

create policy "Users can delete project costs in their tenant" on public.project_costs
  for delete to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can update project costs in their tenant" on public.project_costs
  for update to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can view project costs in their tenant" on public.project_costs
  for select to public
  using ((tenant_id = get_current_user_tenant_id()));

create policy "Users can create cap lease costs through their tenant" on public.cap_lease_costs
  for insert to public
  with check ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can delete cap lease costs through their tenant" on public.cap_lease_costs
  for delete to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update cap lease costs through their tenant" on public.cap_lease_costs
  for update to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view cap lease costs through their tenant" on public.cap_lease_costs
  for select to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can create consumable costs through their tenant" on public.consumable_costs
  for insert to public
  with check ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can delete consumable costs through their tenant" on public.consumable_costs
  for delete to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update consumable costs through their tenant" on public.consumable_costs
  for update to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view consumable costs through their tenant" on public.consumable_costs
  for select to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can create equipment costs through their tenant" on public.equipment_costs
  for insert to public
  with check ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can delete equipment costs through their tenant" on public.equipment_costs
  for delete to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update equipment costs through their tenant" on public.equipment_costs
  for update to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view equipment costs through their tenant" on public.equipment_costs
  for select to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can create labor costs through their tenant" on public.labor_costs
  for insert to public
  with check ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can delete labor costs through their tenant" on public.labor_costs
  for delete to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update labor costs through their tenant" on public.labor_costs
  for update to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view labor costs through their tenant" on public.labor_costs
  for select to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can create material costs through their tenant" on public.material_costs
  for insert to public
  with check ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can delete material costs through their tenant" on public.material_costs
  for delete to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update material costs through their tenant" on public.material_costs
  for update to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view material costs through their tenant" on public.material_costs
  for select to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can create other costs through their tenant" on public.other_costs
  for insert to public
  with check ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can delete other costs through their tenant" on public.other_costs
  for delete to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update other costs through their tenant" on public.other_costs
  for update to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view other costs through their tenant" on public.other_costs
  for select to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can create subcontractor costs through their tenant" on public.subcontractor_costs
  for insert to public
  with check ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can delete subcontractor costs through their tenant" on public.subcontractor_costs
  for delete to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can update subcontractor costs through their tenant" on public.subcontractor_costs
  for update to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

create policy "Users can view subcontractor costs through their tenant" on public.subcontractor_costs
  for select to public
  using ((project_id in (select projects.id from projects where (projects.tenant_id = get_current_user_tenant_id()))));

alter table public.users no force row level security;
alter table public.tenants no force row level security;
alter table public.users disable row level security;
alter table public.tenants disable row level security;

-- Original view. security definer is the Postgres default when security_invoker
-- is not set. It joins auth.users, matching production.
drop view if exists public.user_management_view;
create view public.user_management_view as
select
  u.id,
  u.tenant_id,
  u.name,
  u.email,
  u.role,
  u.permissions,
  u.is_active,
  u.force_password_change,
  u.last_login,
  u.created_at,
  u.updated_at,
  au.last_sign_in_at,
  au.email_confirmed_at,
  case
    when u.force_password_change = true then 'Pending First Login'::text
    when u.last_login is null then 'Never Logged In'::text
    when u.is_active = false then 'Inactive'::text
    else 'Active'::text
  end as status
from users u
left join auth.users au on u.id = au.id;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'users', 'projects', 'employees', 'change_orders',
    'change_order_budgets', 'project_costs', 'project_budgets',
    'customer_invoices', 'attachments', 'audit_logs', 'labor_costs',
    'material_costs', 'equipment_costs', 'other_costs', 'cap_lease_costs',
    'consumable_costs', 'subcontractor_costs', 'user_management_view'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('grant all on table public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Storage policies added or replaced by the forward migration.
drop policy if exists attachments_storage_select on storage.objects;
drop policy if exists attachments_storage_insert on storage.objects;
drop policy if exists attachments_storage_update on storage.objects;
drop policy if exists attachments_storage_delete on storage.objects;
drop policy if exists "Users can delete files from their tenant" on storage.objects;
drop policy if exists "Users can upload files to their tenant" on storage.objects;
drop policy if exists "Users can view files from their tenant" on storage.objects;

create policy "Users can delete files from their tenant" on storage.objects
  for delete to public
  using (((bucket_id = 'attachments'::text) and (auth.uid() is not null) and ((storage.foldername(name))[1] = (select (users.tenant_id)::text as tenant_id from users where (users.id = auth.uid())))));

create policy "Users can upload files to their tenant" on storage.objects
  for insert to public
  with check (((bucket_id = 'attachments'::text) and (auth.uid() is not null) and ((storage.foldername(name))[1] = (select (users.tenant_id)::text as tenant_id from users where (users.id = auth.uid())))));

create policy "Users can view files from their tenant" on storage.objects
  for select to public
  using (((bucket_id = 'attachments'::text) and (auth.uid() is not null) and ((storage.foldername(name))[1] = (select (users.tenant_id)::text as tenant_id from users where (users.id = auth.uid())))));

commit;

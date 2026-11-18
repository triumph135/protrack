-- Rolls back 20261118000000_cost_categories.sql.
-- Restores the original project_costs policies and create_workspace body.
-- Drops category tables and the category_id / custom_fields columns.
-- Rows that existed before keep their original category text and the seven
-- budget columns. Costs entered for a custom category keep category set to
-- 'others' or 'labor', so the old app can still read an amount.
-- Permission JSON may still contain categories, export, and version. The
-- app on main ignores those keys.

begin;

drop trigger if exists project_costs_sync_category on public.project_costs;
drop trigger if exists project_budgets_sync_categories on public.project_budgets;
drop trigger if exists tenants_seed_cost_categories on public.tenants;

drop policy if exists project_costs_select on public.project_costs;
drop policy if exists project_costs_insert on public.project_costs;
drop policy if exists project_costs_update on public.project_costs;
drop policy if exists project_costs_delete on public.project_costs;

create policy project_costs_select on public.project_costs
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy project_costs_insert on public.project_costs
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy project_costs_update on public.project_costs
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy project_costs_delete on public.project_costs
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

create or replace function public.create_workspace(
  p_name text,
  p_subdomain text,
  p_email text,
  p_phone text default null,
  p_plan text default 'professional'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_tenant public.tenants%rowtype;
  v_subdomain text := lower(trim(p_subdomain));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_user from public.users where id = public.current_profile_id();
  if v_user.id is null then
    raise exception 'Profile not found';
  end if;
  if v_user.tenant_id is not null then
    raise exception 'This account already belongs to an organization';
  end if;
  if v_subdomain !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' then
    raise exception 'Subdomain must be 3-50 characters, alphanumeric and hyphens only';
  end if;
  if exists (select 1 from public.tenants where lower(subdomain) = v_subdomain) then
    raise exception 'This subdomain is already taken';
  end if;

  insert into public.tenants (subdomain, name, email, phone, plan, status)
  values (
    v_subdomain,
    trim(p_name),
    trim(p_email),
    nullif(trim(coalesce(p_phone, '')), ''),
    coalesce(nullif(trim(coalesce(p_plan, '')), ''), 'professional'),
    'active'
  )
  returning * into v_tenant;

  update public.users
  set
    tenant_id = v_tenant.id,
    role = 'master',
    permissions = jsonb_build_object(
      'material', 'write',
      'labor', 'write',
      'equipment', 'write',
      'subcontractor', 'write',
      'others', 'write',
      'capLeases', 'write',
      'consumable', 'write',
      'invoices', 'write',
      'projects', 'write',
      'users', 'write'
    )
  where id = v_user.id
    and tenant_id is null;

  return to_jsonb(v_tenant);
end;
$$;

revoke all on function public.create_workspace(text, text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text, text) to authenticated;

alter table public.project_costs drop constraint if exists project_costs_category_id_fkey;
alter table public.project_costs drop constraint if exists project_costs_custom_fields_object;
alter table public.project_costs drop column if exists category_id;
alter table public.project_costs drop column if exists custom_fields;
alter table public.change_order_budgets drop constraint if exists change_order_budgets_category_id_fkey;
alter table public.change_order_budgets drop column if exists category_id;

drop table if exists public.project_category_budgets;
drop table if exists public.cost_categories;
drop table if exists public.phase2_cost_baseline;

drop function if exists public.backfill_category_permissions();
drop function if exists public.can_access_category(uuid, text);
drop function if exists public.resolve_cost_category_id(uuid, text, uuid);
drop function if exists public.sync_project_budget_categories();
drop function if exists public.sync_project_cost_category();
drop function if exists public.seed_cost_categories_for_new_tenant();
drop function if exists public.seed_builtin_cost_categories(uuid);
drop function if exists public.enforce_cost_category_rules();

commit;

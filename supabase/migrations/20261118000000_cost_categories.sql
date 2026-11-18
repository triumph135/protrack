-- Phase 2: custom cost categories.
--
-- Purpose
--   Add tenant-scoped cost categories, point project_costs at them without
--   dropping the legacy category text, copy the seven budget columns into
--   project_category_budgets, and enforce category permissions on
--   project_costs. The app currently on main keeps working: it still writes
--   category text, and a trigger fills category_id.
--
-- Assumes
--   20261113201043_enable_rls.sql has been applied. Built-in keys in use are
--   material, labor, equipment, subcontractor, others, cap_leases, consumable.
--   Safe to run twice. One transaction.
--
-- Verify
--   After this file, project_costs.category_id is null for zero rows,
--   sum(cost) grouped by category text matches the baseline captured below,
--   and project_category_budgets matches the seven project_budgets columns.
--   supabase/tests/phase2_checks.sql asserts the same things.

begin;

create table if not exists public.cost_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  builtin_key text,
  name text not null,
  kind text not null,
  parent_id uuid references public.cost_categories(id) on delete restrict,
  sort_order int not null default 0,
  is_hidden boolean not null default false,
  is_builtin boolean not null default false,
  gl_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint cost_categories_kind_check check (kind in ('standard', 'named', 'labor'))
);

create unique index if not exists cost_categories_builtin_key_unique
  on public.cost_categories (tenant_id, builtin_key)
  where builtin_key is not null;

create unique index if not exists cost_categories_name_unique
  on public.cost_categories (
    tenant_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

create index if not exists cost_categories_tenant_sort_idx
  on public.cost_categories (tenant_id, sort_order);

create table if not exists public.project_category_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id uuid not null references public.cost_categories(id) on delete restrict,
  amount numeric(14,2) not null default 0,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint project_category_budgets_project_category_key unique (project_id, category_id)
);

create index if not exists project_category_budgets_tenant_idx
  on public.project_category_budgets (tenant_id, project_id);

-- Totals captured before the backfill so a re-run can prove nothing moved.
create table if not exists public.phase2_cost_baseline (
  tenant_id uuid not null,
  category text not null,
  row_count bigint not null,
  cost_sum numeric not null,
  captured_at timestamptz not null default now(),
  primary key (tenant_id, category)
);

alter table public.phase2_cost_baseline enable row level security;
revoke all on table public.phase2_cost_baseline from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Category rules. Enforced here, not only in the UI.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_cost_category_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.cost_categories%rowtype;
  v_visible integer;
begin
  if tg_op = 'DELETE' then
    if old.is_builtin then
      raise exception 'Built-in categories cannot be deleted. Hide the category instead';
    end if;
    if exists (select 1 from public.cost_categories where parent_id = old.id) then
      raise exception 'Hide this category instead. It still has subcategories';
    end if;
    if exists (select 1 from public.project_costs where category_id = old.id) then
      raise exception 'Hide this category instead. It still has cost entries';
    end if;
    if exists (select 1 from public.project_category_budgets where category_id = old.id) then
      raise exception 'Hide this category instead. It still has a budget';
    end if;
    if to_regclass('public.change_order_budgets') is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'change_order_budgets'
           and column_name = 'category_id'
       )
       and exists (select 1 from public.change_order_budgets where category_id = old.id) then
      raise exception 'Hide this category instead. It still has a change-order budget';
    end if;
    if not old.is_hidden then
      select count(*) into v_visible
      from public.cost_categories
      where tenant_id = old.tenant_id
        and is_hidden = false
        and id <> old.id;
      if v_visible < 1 then
        raise exception 'At least one visible cost category must remain';
      end if;
    end if;
    return old;
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.cost_categories where id = new.parent_id;
    if v_parent.id is null then
      raise exception 'Parent category was not found';
    end if;
    if v_parent.tenant_id <> new.tenant_id then
      raise exception 'Parent category belongs to another company';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'Categories can only be nested two levels deep';
    end if;
    if v_parent.kind <> new.kind then
      raise exception 'A subcategory must use the same kind as its parent';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.is_builtin then
    if new.builtin_key is distinct from old.builtin_key
       or new.kind is distinct from old.kind
       or new.is_builtin is distinct from true
       or new.tenant_id is distinct from old.tenant_id then
      raise exception 'Built-in categories cannot change their key or kind';
    end if;
  end if;

  if new.is_builtin and new.builtin_key is null then
    raise exception 'A built-in category needs a built-in key';
  end if;
  if not new.is_builtin and new.builtin_key is not null then
    raise exception 'Only built-in categories can set a built-in key';
  end if;

  if exists (
    select 1
    from public.cost_categories
    where tenant_id = new.tenant_id
      and lower(name) = lower(new.name)
      and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(new.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and id is distinct from new.id
  ) then
    raise exception 'A category named "%" already exists here', new.name;
  end if;

  if not new.is_hidden then
    select count(*) into v_visible
    from public.cost_categories
    where tenant_id = new.tenant_id
      and is_hidden = false
      and id is distinct from new.id;
    if v_visible >= 20 then
      raise exception 'A company can have at most 20 visible cost categories';
    end if;
  end if;

  if new.is_hidden and (tg_op = 'INSERT' or old.is_hidden = false) then
    select count(*) into v_visible
    from public.cost_categories
    where tenant_id = new.tenant_id
      and is_hidden = false
      and id is distinct from new.id;
    if v_visible < 1 then
      raise exception 'At least one visible cost category must remain';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cost_categories_enforce on public.cost_categories;
create trigger cost_categories_enforce
  before insert or update or delete on public.cost_categories
  for each row execute function public.enforce_cost_category_rules();

drop trigger if exists update_cost_categories_updated_at on public.cost_categories;
create trigger update_cost_categories_updated_at
  before update on public.cost_categories
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_project_category_budgets_updated_at on public.project_category_budgets;
create trigger update_project_category_budgets_updated_at
  before update on public.project_category_budgets
  for each row execute function public.update_updated_at_column();

create or replace function public.seed_builtin_cost_categories(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cost_categories (tenant_id, builtin_key, name, kind, sort_order, is_builtin)
  select p_tenant_id, v.builtin_key, v.name, v.kind, v.sort_order, true
  from (
    values
      ('material', 'Material', 'standard', 10),
      ('labor', 'Labor', 'labor', 20),
      ('equipment', 'Equipment', 'named', 30),
      ('subcontractor', 'Subcontractor', 'named', 40),
      ('others', 'Others', 'standard', 50),
      ('cap_leases', 'Cap Leases', 'standard', 60),
      ('consumable', 'Consumable', 'standard', 70)
  ) as v(builtin_key, name, kind, sort_order)
  where not exists (
    select 1
    from public.cost_categories cc
    where cc.tenant_id = p_tenant_id
      and cc.builtin_key = v.builtin_key
  );
end;
$$;

create or replace function public.seed_cost_categories_for_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_builtin_cost_categories(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_seed_cost_categories on public.tenants;
create trigger tenants_seed_cost_categories
  after insert on public.tenants
  for each row execute function public.seed_cost_categories_for_new_tenant();

do $$
declare
  r record;
begin
  for r in select id from public.tenants loop
    perform public.seed_builtin_cost_categories(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Costs keep category text. New code writes category_id; old code writes
-- category. Either side fills the other.
-- ---------------------------------------------------------------------------

alter table public.project_costs
  add column if not exists category_id uuid;

alter table public.project_costs
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_costs_category_id_fkey'
  ) then
    alter table public.project_costs
      add constraint project_costs_category_id_fkey
      foreign key (category_id) references public.cost_categories(id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'project_costs_custom_fields_object'
  ) then
    alter table public.project_costs
      add constraint project_costs_custom_fields_object
      check (jsonb_typeof(custom_fields) = 'object');
  end if;
end $$;

create index if not exists project_costs_tenant_category_idx
  on public.project_costs (tenant_id, category_id);

alter table public.change_order_budgets
  add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'change_order_budgets_category_id_fkey'
  ) then
    alter table public.change_order_budgets
      add constraint change_order_budgets_category_id_fkey
      foreign key (category_id) references public.cost_categories(id);
  end if;
end $$;

create or replace function public.sync_project_cost_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_kind text;
  v_parent uuid;
  v_parent_key text;
begin
  if new.custom_fields is null then
    new.custom_fields := '{}'::jsonb;
  end if;

  if new.category_id is null and new.category is not null then
    select id into new.category_id
    from public.cost_categories
    where tenant_id = new.tenant_id
      and builtin_key = new.category;
  end if;

  if new.category_id is not null then
    select builtin_key, kind, parent_id
      into v_key, v_kind, v_parent
    from public.cost_categories
    where id = new.category_id;

    if v_key is not null then
      new.category := v_key;
    else
      select builtin_key into v_parent_key
      from public.cost_categories
      where id = v_parent;
      if v_parent_key is not null then
        new.category := v_parent_key;
      elsif v_kind = 'labor' then
        new.category := 'labor';
      else
        new.category := 'others';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists project_costs_sync_category on public.project_costs;
create trigger project_costs_sync_category
  before insert or update on public.project_costs
  for each row execute function public.sync_project_cost_category();

do $$
declare
  v_captured integer := 0;
  v_missing integer;
  v_drift integer;
begin
  insert into public.phase2_cost_baseline (tenant_id, category, row_count, cost_sum)
  select tenant_id, category, count(*), coalesce(sum(cost), 0)
  from public.project_costs
  group by tenant_id, category
  on conflict (tenant_id, category) do nothing;
  get diagnostics v_captured = row_count;

  update public.project_costs pc
  set category_id = cc.id
  from public.cost_categories cc
  where pc.category_id is null
    and cc.tenant_id = pc.tenant_id
    and cc.builtin_key = pc.category;

  select count(*) into v_missing from public.project_costs where category_id is null;
  if v_missing > 0 then
    raise exception '% project cost row(s) have no matching built-in category', v_missing;
  end if;

  -- Only the run that first recorded the baseline compares totals. A later
  -- re-run leaves that snapshot alone, so costs entered afterwards are safe.
  if v_captured > 0 then
    select count(*) into v_drift
    from public.phase2_cost_baseline b
    full join (
      select tenant_id, category, count(*) as row_count, coalesce(sum(cost), 0) as cost_sum
      from public.project_costs
      group by tenant_id, category
    ) c using (tenant_id, category)
    where b.row_count is distinct from c.row_count
       or b.cost_sum is distinct from c.cost_sum;
    if v_drift > 0 then
      raise exception 'Cost totals changed while filling category_id';
    end if;
  end if;
end $$;

-- Old code writes project_budgets until this PR is deployed. Copy those
-- writes forward so the new table does not go stale in that window.
create or replace function public.sync_project_budget_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_category_budgets (tenant_id, project_id, category_id, amount, updated_by)
  select new.tenant_id, new.project_id, cc.id, v.amount, new.updated_by
  from (
    values
      ('material', new.material_budget),
      ('labor', new.labor_budget),
      ('equipment', new.equipment_budget),
      ('subcontractor', new.subcontractor_budget),
      ('others', new.others_budget),
      ('cap_leases', new.cap_leases_budget),
      ('consumable', new.consumable_budget)
  ) as v(builtin_key, amount)
  join public.cost_categories cc
    on cc.tenant_id = new.tenant_id
   and cc.builtin_key = v.builtin_key
  where v.amount is not null
  on conflict (project_id, category_id) do update
    set amount = excluded.amount,
        updated_by = excluded.updated_by,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_budgets_sync_categories on public.project_budgets;
create trigger project_budgets_sync_categories
  after insert or update on public.project_budgets
  for each row execute function public.sync_project_budget_categories();

insert into public.project_category_budgets (tenant_id, project_id, category_id, amount, updated_by)
select pb.tenant_id, pb.project_id, cc.id, v.amount, pb.updated_by
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
  on cc.tenant_id = pb.tenant_id
 and cc.builtin_key = v.builtin_key
where v.amount is not null
on conflict (project_id, category_id) do update
  set amount = excluded.amount,
      updated_by = excluded.updated_by,
      updated_at = now()
  where public.project_category_budgets.amount is distinct from excluded.amount;

-- ---------------------------------------------------------------------------
-- Permissions. Legacy flat keys stay. categories / export / version are added
-- beside them. A missing built-in key is not written as "none": the database
-- before this migration did not check category permissions, and the RLS
-- suite (plus any profile saved as '{}') still relies on that.
-- ---------------------------------------------------------------------------

create or replace function public.backfill_category_permissions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  cat record;
  legacy text;
  level text;
  perms jsonb;
  cats jsonb;
  ex jsonb;
  area text;
begin
  for r in select id, tenant_id, permissions from public.users loop
    perms := coalesce(r.permissions, '{}'::jsonb);
    cats := coalesce(perms -> 'categories', '{}'::jsonb);
    ex := coalesce(perms -> 'export', '{}'::jsonb);

    if r.tenant_id is not null then
      for cat in
        select id, builtin_key
        from public.cost_categories
        where tenant_id = r.tenant_id
          and builtin_key is not null
      loop
        legacy := case cat.builtin_key when 'cap_leases' then 'capLeases' else cat.builtin_key end;
        if perms ? legacy and not (cats ? cat.id::text) then
          level := perms ->> legacy;
          cats := cats || jsonb_build_object(cat.id::text, level);
          if level in ('read', 'write') and not (ex ? cat.id::text) then
            ex := ex || jsonb_build_object(cat.id::text, true);
          end if;
        end if;
      end loop;
    end if;

    foreach area in array array['invoices', 'projects', 'users'] loop
      if perms ? area
         and (perms ->> area) in ('read', 'write')
         and not (ex ? area) then
        ex := ex || jsonb_build_object(area, true);
      end if;
    end loop;

    perms := jsonb_set(perms, '{categories}', cats, true);
    perms := jsonb_set(perms, '{export}', ex, true);
    if not (perms ? 'version') then
      perms := jsonb_set(perms, '{version}', '2'::jsonb, true);
    end if;

    update public.users set permissions = perms where id = r.id and permissions is distinct from perms;
  end loop;

  for r in select id, tenant_id, permissions from public.user_invitations loop
    perms := coalesce(r.permissions, '{}'::jsonb);
    cats := coalesce(perms -> 'categories', '{}'::jsonb);
    ex := coalesce(perms -> 'export', '{}'::jsonb);
    for cat in
      select id, builtin_key
      from public.cost_categories
      where tenant_id = r.tenant_id
        and builtin_key is not null
    loop
      legacy := case cat.builtin_key when 'cap_leases' then 'capLeases' else cat.builtin_key end;
      if perms ? legacy and not (cats ? cat.id::text) then
        level := perms ->> legacy;
        cats := cats || jsonb_build_object(cat.id::text, level);
        if level in ('read', 'write') and not (ex ? cat.id::text) then
          ex := ex || jsonb_build_object(cat.id::text, true);
        end if;
      end if;
    end loop;
    perms := jsonb_set(perms, '{categories}', cats, true);
    perms := jsonb_set(perms, '{export}', ex, true);
    if not (perms ? 'version') then
      perms := jsonb_set(perms, '{version}', '2'::jsonb, true);
    end if;
    update public.user_invitations
    set permissions = perms
    where id = r.id
      and permissions is distinct from perms;
  end loop;
end;
$$;

select public.backfill_category_permissions();

create or replace function public.resolve_cost_category_id(
  p_category_id uuid,
  p_category text,
  p_tenant_id uuid
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_category_id,
    (
      select cc.id
      from public.cost_categories cc
      where cc.tenant_id = p_tenant_id
        and cc.builtin_key = p_category
      limit 1
    )
  )
$$;

create or replace function public.can_access_category(p_category_id uuid, p_level text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_perms jsonb;
  v_builtin text;
  v_parent uuid;
  v_legacy text;
  v_level text;
  v_mapped text;
begin
  if p_level not in ('read', 'write') then
    return false;
  end if;
  if public.current_profile_id() is null then
    return false;
  end if;

  select role, permissions into v_role, v_perms
  from public.users
  where id = public.current_profile_id();

  if v_role = 'master' then
    return true;
  end if;
  if p_category_id is null then
    return false;
  end if;

  select builtin_key, parent_id into v_builtin, v_parent
  from public.cost_categories
  where id = p_category_id
    and tenant_id = public.current_tenant_id();
  if not found then
    return false;
  end if;

  if v_builtin is null and v_parent is not null then
    select builtin_key into v_builtin
    from public.cost_categories
    where id = v_parent;
  end if;

  v_perms := coalesce(v_perms, '{}'::jsonb);
  v_mapped := v_perms -> 'categories' ->> p_category_id::text;
  if v_mapped is not null then
    if p_level = 'read' then
      return v_mapped in ('read', 'write');
    end if;
    return v_mapped = 'write';
  end if;

  if v_builtin is not null then
    v_legacy := case v_builtin when 'cap_leases' then 'capLeases' else v_builtin end;
    if v_perms ? v_legacy then
      v_level := v_perms ->> v_legacy;
      if p_level = 'read' then
        return v_level in ('read', 'write');
      end if;
      return v_level = 'write';
    end if;
    -- The key was never set. Pre-Phase-2 policies allowed every member.
    return true;
  end if;

  return false;
end;
$$;

-- create_workspace still has the same signature. Extra permission keys are
-- ignored by the app currently on main. Masters bypass category checks, so
-- this is not required for compatibility; it keeps a new company consistent.
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
  v_categories jsonb;
  v_export jsonb;
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

  select
    coalesce(jsonb_object_agg(id::text, 'write'), '{}'::jsonb),
    coalesce(jsonb_object_agg(id::text, to_jsonb(true)), '{}'::jsonb)
  into v_categories, v_export
  from public.cost_categories
  where tenant_id = v_tenant.id;

  v_export := v_export || jsonb_build_object(
    'invoices', true,
    'projects', true,
    'users', true,
    'employees', true
  );

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
      'users', 'write',
      'version', 2,
      'categories', v_categories,
      'export', v_export
    )
  where id = v_user.id
    and tenant_id is null;

  return to_jsonb(v_tenant);
end;
$$;

drop policy if exists project_costs_select on public.project_costs;
drop policy if exists project_costs_insert on public.project_costs;
drop policy if exists project_costs_update on public.project_costs;
drop policy if exists project_costs_delete on public.project_costs;

create policy project_costs_select on public.project_costs
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'read'
    )
  );

create policy project_costs_insert on public.project_costs
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );

create policy project_costs_update on public.project_costs
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );

create policy project_costs_delete on public.project_costs
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );

alter table public.cost_categories enable row level security;
alter table public.project_category_budgets enable row level security;

drop policy if exists cost_categories_select on public.cost_categories;
drop policy if exists cost_categories_insert on public.cost_categories;
drop policy if exists cost_categories_update on public.cost_categories;
drop policy if exists cost_categories_delete on public.cost_categories;

create policy cost_categories_select on public.cost_categories
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy cost_categories_insert on public.cost_categories
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_master());

create policy cost_categories_update on public.cost_categories
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master())
  with check (tenant_id = public.current_tenant_id() and public.is_master());

create policy cost_categories_delete on public.cost_categories
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists project_category_budgets_select on public.project_category_budgets;
drop policy if exists project_category_budgets_insert on public.project_category_budgets;
drop policy if exists project_category_budgets_update on public.project_category_budgets;
drop policy if exists project_category_budgets_delete on public.project_category_budgets;

create policy project_category_budgets_select on public.project_category_budgets
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy project_category_budgets_insert on public.project_category_budgets
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy project_category_budgets_update on public.project_category_budgets
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy project_category_budgets_delete on public.project_category_budgets
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

revoke all on table public.cost_categories from public, anon;
revoke all on table public.project_category_budgets from public, anon;
grant select, insert, update, delete on table public.cost_categories to authenticated;
grant select, insert, update, delete on table public.project_category_budgets to authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.enforce_cost_category_rules()',
    'public.seed_builtin_cost_categories(uuid)',
    'public.seed_cost_categories_for_new_tenant()',
    'public.sync_project_cost_category()',
    'public.sync_project_budget_categories()',
    'public.backfill_category_permissions()',
    'public.resolve_cost_category_id(uuid, text, uuid)',
    'public.can_access_category(uuid, text)',
    'public.create_workspace(text, text, text, text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- Backfill is an internal step. Signed-in users do not need to call it.
revoke all on function public.backfill_category_permissions() from authenticated;

commit;

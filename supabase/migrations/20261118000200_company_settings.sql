-- Phase 2: company settings.
--
-- Purpose
--   Labor split (direct / indirect), up to five custom labor fields, and
--   project visibility. Visibility defaults to 'all', which matches today:
--   a missing tenants.settings.project_visibility key is treated as 'all'.
--   labor_split_enabled defaults to false by being absent.
--
-- Assumes
--   20261118000000_cost_categories.sql has been applied (cost categories,
--   can_access_category, project_category_budgets). Safe to run twice.
--   One transaction.
--
-- Verify
--   With project_visibility left unset, a project manager still sees every
--   project in the company. supabase/tests/phase2_checks.sql flips the
--   setting and checks the narrower policies, the labor split, and the
--   five-field cap.

begin;

create table if not exists public.labor_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  field_type text not null,
  options jsonb not null default '[]'::jsonb,
  preset_key text,
  is_enabled boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint labor_field_definitions_type_check
    check (field_type in ('text', 'number', 'select', 'boolean'))
);

create unique index if not exists labor_field_definitions_label_unique
  on public.labor_field_definitions (tenant_id, lower(label));

create unique index if not exists labor_field_definitions_preset_unique
  on public.labor_field_definitions (tenant_id, preset_key)
  where preset_key is not null;

create table if not exists public.project_assignments (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_assignments_user_idx
  on public.project_assignments (user_id);

create index if not exists project_assignments_tenant_idx
  on public.project_assignments (tenant_id);

create or replace function public.enforce_labor_field_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled integer;
begin
  if exists (
    select 1
    from public.labor_field_definitions
    where tenant_id = new.tenant_id
      and lower(label) = lower(new.label)
      and id is distinct from new.id
  ) then
    raise exception 'A labor field named "%" already exists', new.label;
  end if;

  if new.is_enabled then
    select count(*) into v_enabled
    from public.labor_field_definitions
    where tenant_id = new.tenant_id
      and is_enabled
      and id is distinct from new.id;
    if v_enabled >= 5 then
      raise exception 'At most 5 labor fields can be enabled';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists labor_field_definitions_enforce on public.labor_field_definitions;
create trigger labor_field_definitions_enforce
  before insert or update on public.labor_field_definitions
  for each row execute function public.enforce_labor_field_rules();

drop trigger if exists update_labor_field_definitions_updated_at on public.labor_field_definitions;
create trigger update_labor_field_definitions_updated_at
  before update on public.labor_field_definitions
  for each row execute function public.update_updated_at_column();

create or replace function public.seed_labor_field_presets(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.labor_field_definitions
    (tenant_id, label, field_type, options, preset_key, is_enabled, sort_order)
  select p_tenant_id, v.label, v.field_type, v.options, v.preset_key, false, v.sort_order
  from (
    values
      ('Cost code', 'text', '[]'::jsonb, 'cost_code', 10),
      ('Crew', 'select', '[]'::jsonb, 'crew', 20),
      ('Shift', 'select', '["Day","Night"]'::jsonb, 'shift', 30),
      ('Billable', 'boolean', '[]'::jsonb, 'billable', 40)
  ) as v(label, field_type, options, preset_key, sort_order)
  where not exists (
    select 1
    from public.labor_field_definitions f
    where f.tenant_id = p_tenant_id
      and f.preset_key = v.preset_key
  );
end;
$$;

create or replace function public.seed_labor_fields_for_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_labor_field_presets(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_seed_labor_fields on public.tenants;
create trigger tenants_seed_labor_fields
  after insert on public.tenants
  for each row execute function public.seed_labor_fields_for_new_tenant();

do $$
declare
  r record;
begin
  for r in select id from public.tenants loop
    perform public.seed_labor_field_presets(r.id);
  end loop;
end $$;

-- Uses the caller's company and the project id already in hand. It does not
-- read public.projects, so an INSERT ... RETURNING on projects can satisfy
-- the select policy before that new row is visible to a second query.
create or replace function public.project_row_visible(p_project_id uuid, p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    left join public.tenants t on t.id = u.tenant_id
    where u.id = public.current_profile_id()
      and u.tenant_id is not null
      and u.tenant_id = p_tenant_id
      and (
        u.role = 'master'
        or coalesce(t.settings ->> 'project_visibility', 'all') = 'all'
        or exists (
          select 1
          from public.project_assignments a
          where a.project_id = p_project_id
            and a.user_id = u.id
        )
      )
  )
$$;

create or replace function public.can_see_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.project_row_visible(p.id, p.tenant_id)
  )
$$;

create or replace function public.set_labor_split(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_labor uuid;
  v_direct uuid;
  v_indirect uuid;
  v_visible integer;
  v_direct_hidden boolean;
  v_indirect_hidden boolean;
begin
  if not public.is_master() then
    raise exception 'Only a master can change labor settings';
  end if;
  if v_tenant is null then
    raise exception 'Organization setup is required';
  end if;

  select id into v_labor
  from public.cost_categories
  where tenant_id = v_tenant
    and builtin_key = 'labor';
  if v_labor is null then
    raise exception 'Labor category is missing';
  end if;

  if p_enabled then
    select id, is_hidden into v_direct, v_direct_hidden
    from public.cost_categories
    where tenant_id = v_tenant
      and parent_id = v_labor
      and lower(name) = 'direct labor';
    select id, is_hidden into v_indirect, v_indirect_hidden
    from public.cost_categories
    where tenant_id = v_tenant
      and parent_id = v_labor
      and lower(name) = 'indirect labor';

    select count(*) into v_visible
    from public.cost_categories
    where tenant_id = v_tenant
      and is_hidden = false;

    if v_direct is null then
      v_visible := v_visible + 1;
    elsif v_direct_hidden then
      v_visible := v_visible + 1;
    end if;
    if v_indirect is null then
      v_visible := v_visible + 1;
    elsif v_indirect_hidden then
      v_visible := v_visible + 1;
    end if;
    if v_visible > 20 then
      raise exception 'Turning on direct and indirect labor would exceed 20 visible categories';
    end if;

    if v_direct is null then
      insert into public.cost_categories (tenant_id, name, kind, parent_id, sort_order, is_hidden, is_builtin)
      values (v_tenant, 'Direct Labor', 'labor', v_labor, 21, false, false);
    else
      update public.cost_categories
      set is_hidden = false
      where id = v_direct;
    end if;
    if v_indirect is null then
      insert into public.cost_categories (tenant_id, name, kind, parent_id, sort_order, is_hidden, is_builtin)
      values (v_tenant, 'Indirect Labor', 'labor', v_labor, 22, false, false);
    else
      update public.cost_categories
      set is_hidden = false
      where id = v_indirect;
    end if;

    update public.tenants
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('labor_split_enabled', true)
    where id = v_tenant;
  else
    update public.cost_categories
    set is_hidden = true
    where tenant_id = v_tenant
      and parent_id = v_labor
      and lower(name) in ('direct labor', 'indirect labor');

    update public.tenants
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('labor_split_enabled', false)
    where id = v_tenant;
  end if;

  return jsonb_build_object('labor_split_enabled', p_enabled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies. Default visibility is "all", so these match the previous tenant
-- check for every current company. project_costs keeps the category check
-- from the previous migration.
-- ---------------------------------------------------------------------------

drop policy if exists projects_select on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.project_row_visible(id, tenant_id));
create policy projects_update on public.projects
  for update to authenticated
  using (public.project_row_visible(id, tenant_id))
  with check (public.project_row_visible(id, tenant_id));
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.project_row_visible(id, tenant_id) and public.is_master());

drop policy if exists project_costs_select on public.project_costs;
drop policy if exists project_costs_insert on public.project_costs;
drop policy if exists project_costs_update on public.project_costs;
drop policy if exists project_costs_delete on public.project_costs;
create policy project_costs_select on public.project_costs
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'read'
    )
  );
create policy project_costs_insert on public.project_costs
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );
create policy project_costs_update on public.project_costs
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );
create policy project_costs_delete on public.project_costs
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );

drop policy if exists customer_invoices_select on public.customer_invoices;
drop policy if exists customer_invoices_insert on public.customer_invoices;
drop policy if exists customer_invoices_update on public.customer_invoices;
drop policy if exists customer_invoices_delete on public.customer_invoices;
create policy customer_invoices_select on public.customer_invoices
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy customer_invoices_insert on public.customer_invoices
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy customer_invoices_update on public.customer_invoices
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id))
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy customer_invoices_delete on public.customer_invoices
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.is_master()
  );

drop policy if exists change_orders_select on public.change_orders;
drop policy if exists change_orders_insert on public.change_orders;
drop policy if exists change_orders_update on public.change_orders;
drop policy if exists change_orders_delete on public.change_orders;
create policy change_orders_select on public.change_orders
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy change_orders_insert on public.change_orders
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy change_orders_update on public.change_orders
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id))
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy change_orders_delete on public.change_orders
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.is_master()
  );

drop policy if exists project_budgets_select on public.project_budgets;
drop policy if exists project_budgets_insert on public.project_budgets;
drop policy if exists project_budgets_update on public.project_budgets;
drop policy if exists project_budgets_delete on public.project_budgets;
create policy project_budgets_select on public.project_budgets
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy project_budgets_insert on public.project_budgets
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy project_budgets_update on public.project_budgets
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id))
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy project_budgets_delete on public.project_budgets
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.is_master()
  );

drop policy if exists project_category_budgets_select on public.project_category_budgets;
drop policy if exists project_category_budgets_insert on public.project_category_budgets;
drop policy if exists project_category_budgets_update on public.project_category_budgets;
drop policy if exists project_category_budgets_delete on public.project_category_budgets;
create policy project_category_budgets_select on public.project_category_budgets
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy project_category_budgets_insert on public.project_category_budgets
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy project_category_budgets_update on public.project_category_budgets
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_see_project(project_id))
  with check (tenant_id = public.current_tenant_id() and public.can_see_project(project_id));
create policy project_category_budgets_delete on public.project_category_budgets
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_see_project(project_id)
    and public.is_master()
  );

drop policy if exists change_order_budgets_select on public.change_order_budgets;
drop policy if exists change_order_budgets_insert on public.change_order_budgets;
drop policy if exists change_order_budgets_update on public.change_order_budgets;
drop policy if exists change_order_budgets_delete on public.change_order_budgets;
create policy change_order_budgets_select on public.change_order_budgets
  for select to authenticated
  using (
    exists (
      select 1
      from public.change_orders co
      where co.id = change_order_budgets.change_order_id
        and co.tenant_id = public.current_tenant_id()
        and public.can_see_project(co.project_id)
    )
  );
create policy change_order_budgets_insert on public.change_order_budgets
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.change_orders co
      where co.id = change_order_budgets.change_order_id
        and co.tenant_id = public.current_tenant_id()
        and public.can_see_project(co.project_id)
    )
  );
create policy change_order_budgets_update on public.change_order_budgets
  for update to authenticated
  using (
    exists (
      select 1
      from public.change_orders co
      where co.id = change_order_budgets.change_order_id
        and co.tenant_id = public.current_tenant_id()
        and public.can_see_project(co.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.change_orders co
      where co.id = change_order_budgets.change_order_id
        and co.tenant_id = public.current_tenant_id()
        and public.can_see_project(co.project_id)
    )
  );
create policy change_order_budgets_delete on public.change_order_budgets
  for delete to authenticated
  using (
    public.is_master()
    and exists (
      select 1
      from public.change_orders co
      where co.id = change_order_budgets.change_order_id
        and co.tenant_id = public.current_tenant_id()
        and public.can_see_project(co.project_id)
    )
  );

drop policy if exists employees_select on public.employees;
drop policy if exists employees_insert on public.employees;
drop policy if exists employees_update on public.employees;
drop policy if exists employees_delete on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (project_id is null or public.can_see_project(project_id))
  );
create policy employees_insert on public.employees
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (project_id is null or public.can_see_project(project_id))
  );
create policy employees_update on public.employees
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (project_id is null or public.can_see_project(project_id))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (project_id is null or public.can_see_project(project_id))
  );
create policy employees_delete on public.employees
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_master()
    and (project_id is null or public.can_see_project(project_id))
  );

create or replace function public.attachment_project_visible(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity_type = 'cost' then exists (
      select 1
      from public.project_costs pc
      where pc.id = p_entity_id
        and public.can_see_project(pc.project_id)
        and public.can_access_category(
          public.resolve_cost_category_id(pc.category_id, pc.category, pc.tenant_id),
          'read'
        )
    )
    when p_entity_type = 'customer_invoice' then exists (
      select 1
      from public.customer_invoices inv
      where inv.id = p_entity_id
        and public.can_see_project(inv.project_id)
    )
    when p_entity_type = 'project' then public.can_see_project(p_entity_id)
    when p_entity_type = 'change_order' then exists (
      select 1
      from public.change_orders co
      where co.id = p_entity_id
        and public.can_see_project(co.project_id)
    )
    else true
  end
$$;

drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
drop policy if exists attachments_delete on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.attachment_project_visible(entity_type, entity_id)
  );
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.attachment_project_visible(entity_type, entity_id)
  );
create policy attachments_update on public.attachments
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.attachment_project_visible(entity_type, entity_id)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.attachment_project_visible(entity_type, entity_id)
  );
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.attachment_project_visible(entity_type, entity_id)
    and (uploaded_by = (select auth.uid()) or public.is_master())
  );

alter table public.labor_field_definitions enable row level security;
alter table public.project_assignments enable row level security;

drop policy if exists labor_field_definitions_select on public.labor_field_definitions;
drop policy if exists labor_field_definitions_insert on public.labor_field_definitions;
drop policy if exists labor_field_definitions_update on public.labor_field_definitions;
drop policy if exists labor_field_definitions_delete on public.labor_field_definitions;
create policy labor_field_definitions_select on public.labor_field_definitions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy labor_field_definitions_insert on public.labor_field_definitions
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_master());
create policy labor_field_definitions_update on public.labor_field_definitions
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master())
  with check (tenant_id = public.current_tenant_id() and public.is_master());
create policy labor_field_definitions_delete on public.labor_field_definitions
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists project_assignments_select on public.project_assignments;
drop policy if exists project_assignments_insert on public.project_assignments;
drop policy if exists project_assignments_delete on public.project_assignments;
create policy project_assignments_select on public.project_assignments
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy project_assignments_insert on public.project_assignments
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_users_write());
create policy project_assignments_delete on public.project_assignments
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_users_write());

-- Copies project ids stored on an invite (permissions.projectIds) onto the
-- member who just accepted it. The invitee cannot insert assignments
-- themselves. Safe to call twice.
create or replace function public.apply_invite_project_assignments(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.user_invitations%rowtype;
  v_project uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
  from public.user_invitations
  where invitation_token = p_token;

  if v_invite.id is null then
    return;
  end if;

  if not exists (
    select 1 from public.users
    where id = v_uid and tenant_id = v_invite.tenant_id
  ) then
    raise exception 'You are not a member of this organization';
  end if;

  for v_project in
    select value::uuid
    from jsonb_array_elements_text(coalesce(v_invite.permissions -> 'projectIds', '[]'::jsonb)) as value
  loop
    insert into public.project_assignments (project_id, user_id, tenant_id)
    select p.id, v_uid, v_invite.tenant_id
    from public.projects p
    where p.id = v_project
      and p.tenant_id = v_invite.tenant_id
    on conflict (project_id, user_id) do nothing;
  end loop;
end;
$$;

revoke all on table public.labor_field_definitions from public, anon;
revoke all on table public.project_assignments from public, anon;
grant select, insert, update, delete on table public.labor_field_definitions to authenticated;
grant select, insert, update, delete on table public.project_assignments to authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.enforce_labor_field_rules()',
    'public.seed_labor_field_presets(uuid)',
    'public.seed_labor_fields_for_new_tenant()',
    'public.project_row_visible(uuid, uuid)',
    'public.can_see_project(uuid)',
    'public.set_labor_split(boolean)',
    'public.attachment_project_visible(text, uuid)',
    'public.apply_invite_project_assignments(text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

commit;

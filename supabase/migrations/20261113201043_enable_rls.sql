-- Apply in the Supabase SQL editor against ProTrack-Prod (or a copy of it).
-- One transaction. Safe to run twice. Does not assume any earlier repo migration ran.
--
-- Production shape this targets (snapshot 2026-11-13, ref cqocddiracijeccswqzz):
-- - RLS is already on for every public table except users and tenants.
-- - Those two tables have policies, but RLS is off, so the anon key can read
--   and write every user and tenant.
-- - user_invitations does not exist.
-- - Existing policies are PERMISSIVE and apply to PUBLIC (including anon).
-- - anon and authenticated have full table grants, including users.password_hash.
--
-- This migration drops every existing public policy by its stored name and
-- installs one intentional set. It does not leave the old and new policies
-- OR-ed together.

begin;

-- Drop every public policy first. The second run's policies depend on the
-- helper functions below, so those functions cannot be replaced until the
-- policies are gone. Names come from pg_policy, including truncated ones.
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

-- ---------------------------------------------------------------------------
-- Invitations. Missing in production. Created before the functions that
-- use the row type. Token default matches the app's token check
-- (20-200 url-safe characters). invited_by FK name is the one PostgREST
-- uses for users!user_invitations_invited_by_fkey.
-- ---------------------------------------------------------------------------

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  email character varying(255) not null,
  role character varying(50) not null,
  permissions jsonb default '{}'::jsonb,
  invited_by uuid,
  invitation_token text not null default gen_random_uuid()::text,
  status character varying(20) not null default 'pending',
  expires_at timestamp with time zone not null default (now() + interval '7 days'),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint user_invitations_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint user_invitations_invited_by_fkey
    foreign key (invited_by) references public.users(id) on delete set null
);

create unique index if not exists user_invitations_token_key
  on public.user_invitations (invitation_token);
create index if not exists user_invitations_tenant_status_idx
  on public.user_invitations (tenant_id, status);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'update_user_invitations_updated_at'
      and tgrelid = 'public.user_invitations'::regclass
  ) and to_regprocedure('public.update_updated_at_column()') is not null then
    create trigger update_user_invitations_updated_at
      before update on public.user_invitations
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers. security definer so policies do not recurse through RLS.
-- Profile resolution prefers users.id = auth.uid(). If that row is missing
-- and exactly one users row has the signed-in email, that row is used.
-- That is the login email fallback. An unsigned request resolves to null.
-- ---------------------------------------------------------------------------

-- Replace helpers in place. Dropping them fails on a second apply because
-- the storage policies created by the next file depend on current_tenant_id().
-- Signatures stay stable, so CREATE OR REPLACE is enough.
drop function if exists public.create_workspace(text, text, text, text, text);
drop function if exists public.accept_tenant_invitation(text);

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(lower(auth.jwt() ->> 'email'), '')
$$;

create or replace function public.current_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
  v_count integer;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id into v_id
  from public.users
  where id = auth.uid();
  if found then
    return v_id;
  end if;

  v_email := public.current_user_email();
  if v_email is null then
    return null;
  end if;

  select count(*) into v_count
  from public.users
  where lower(email) = v_email;

  if v_count = 1 then
    select id into v_id
    from public.users
    where lower(email) = v_email;
    return v_id;
  end if;
  return null;
end;
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = public.current_profile_id()
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = public.current_profile_id()
$$;

create or replace function public.current_user_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select permissions from public.users where id = public.current_profile_id()
$$;

create or replace function public.has_users_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select role = 'master'
        or coalesce(permissions->>'users', 'none') = 'write'
    from public.users
    where id = public.current_profile_id()
  ), false)
$$;

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select role = 'master'
       and coalesce(is_active, false)
       and tenant_id is not null
    from public.users
    where id = public.current_profile_id()
  ), false)
$$;

revoke all on function public.current_user_email() from public, anon;
revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.current_tenant_id() from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.current_user_permissions() from public, anon;
revoke all on function public.has_users_write() from public, anon;
revoke all on function public.is_master() from public, anon;

grant execute on function public.current_user_email() to authenticated;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_permissions() to authenticated;
grant execute on function public.has_users_write() to authenticated;
grant execute on function public.is_master() to authenticated;

-- Existing security-definer functions: pin search_path and stop anon calling them.
-- Bodies are unchanged. The trigger function stays callable by signed-in users
-- because their updates fire it.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.get_current_user_tenant_id()',
    'public.is_current_user_master()',
    'public.user_can_access_tenant(uuid)',
    'public.get_tenant_id_from_project(uuid)',
    'public.send_user_invitation(text, uuid, text, text)'
  ]
  loop
    if to_regprocedure(fn) is null then
      raise notice 'Skipping missing function %', fn;
      continue;
    end if;
    execute format('alter function %s set search_path = public', fn);
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;

  if to_regprocedure('public.update_updated_at_column()') is not null then
    execute 'alter function public.update_updated_at_column() set search_path = public';
    execute 'revoke all on function public.update_updated_at_column() from public, anon';
    execute 'grant execute on function public.update_updated_at_column() to authenticated';
  end if;
end $$;

-- send_user_invitation is not used by the app (mail goes through the service
-- role). Signed-in browsers do not need to call it.
do $$
begin
  if to_regprocedure('public.send_user_invitation(text, uuid, text, text)') is not null then
    revoke all on function public.send_user_invitation(text, uuid, text, text) from public, anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Workspace creation and invitation acceptance run as the owner, so a member
-- cannot point their own users.tenant_id at another company from the client.
-- ---------------------------------------------------------------------------

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

create or replace function public.accept_tenant_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_invite public.user_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_user from public.users where id = public.current_profile_id();
  if v_user.id is null then
    raise exception 'Profile not found';
  end if;

  select * into v_invite
  from public.user_invitations
  where invitation_token = p_token
    and status = 'pending';

  if v_invite.id is null then
    raise exception 'Invitation not found or already used';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Invitation has expired';
  end if;
  if lower(v_invite.email) <> lower(v_user.email) then
    raise exception 'This invitation is for a different email address';
  end if;
  if v_user.tenant_id is not null and v_user.tenant_id <> v_invite.tenant_id then
    raise exception 'This account already belongs to another organization';
  end if;
  if v_user.tenant_id = v_invite.tenant_id then
    raise exception 'You are already a member of this organization';
  end if;

  update public.users
  set
    tenant_id = v_invite.tenant_id,
    role = v_invite.role,
    permissions = v_invite.permissions,
    is_active = true
  where id = v_user.id
    and tenant_id is null;

  update public.user_invitations
  set status = 'accepted', updated_at = now()
  where id = v_invite.id;

  return jsonb_build_object('tenant_id', v_invite.tenant_id, 'role', v_invite.role);
end;
$$;

revoke all on function public.create_workspace(text, text, text, text, text) from public, anon;
revoke all on function public.accept_tenant_invitation(text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text, text) to authenticated;
grant execute on function public.accept_tenant_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- password_hash is leftover. Auth lives in Supabase Auth.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'password_hash'
  ) then
    revoke select (password_hash), insert (password_hash), update (password_hash), references (password_hash)
      on table public.users
      from public, anon, authenticated;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants',
    'users',
    'projects',
    'employees',
    'change_orders',
    'change_order_budgets',
    'project_costs',
    'project_budgets',
    'customer_invoices',
    'attachments',
    'audit_logs',
    'labor_costs',
    'material_costs',
    'equipment_costs',
    'other_costs',
    'cap_lease_costs',
    'consumable_costs',
    'subcontractor_costs',
    'user_invitations'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Skipping missing table %', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('revoke truncate on table public.%I from authenticated', t);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      t
    );
  end loop;
end $$;

-- A column list binds only to the privilege written immediately before it.
-- GRANT SELECT, INSERT, UPDATE (cols) would leave SELECT and INSERT on every
-- column, including password_hash. Name the columns on each privilege.
revoke all on table public.users from authenticated;
grant select (
  id, tenant_id, name, email, role, permissions,
  is_active, last_login, created_at, updated_at, force_password_change
), insert (
  id, tenant_id, name, email, role, permissions,
  is_active, last_login, created_at, updated_at, force_password_change
), update (
  id, tenant_id, name, email, role, permissions,
  is_active, last_login, created_at, updated_at, force_password_change
) on table public.users to authenticated;
grant delete on table public.users to authenticated;

-- Tenants: a member can read their company. Masters can update it.
-- Creating a company goes through create_workspace(), which bypasses RLS.
create policy tenants_select on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

create policy tenants_update on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id() and public.is_master())
  with check (id = public.current_tenant_id() and public.is_master());

-- Users: own row (by auth id or the single email-matched profile), plus
-- coworkers in the same company. Signup may insert only an unscoped entry
-- profile for the signed-in user. Members cannot change their role,
-- permissions, or company. Masters and people with users=write can edit
-- coworkers but cannot move them to another company.
create policy users_select on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or id = public.current_profile_id()
    or (tenant_id is not null and tenant_id = public.current_tenant_id())
  );

create policy users_insert on public.users
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and tenant_id is null
    and role = 'entry'
  );

create policy users_update on public.users
  for update to authenticated
  using (
    id = (select auth.uid())
    or id = public.current_profile_id()
    or (
      tenant_id is not null
      and tenant_id = public.current_tenant_id()
      and public.has_users_write()
    )
  )
  with check (
    (
      public.has_users_write()
      and tenant_id is not null
      and tenant_id = public.current_tenant_id()
    )
    or (
      (
        id = (select auth.uid())
        or id = public.current_profile_id()
      )
      and tenant_id is not distinct from public.current_tenant_id()
      and role is not distinct from public.current_user_role()
      and permissions is not distinct from public.current_user_permissions()
    )
  );

create policy users_delete on public.users
  for delete to authenticated
  using (
    public.is_master()
    and tenant_id = public.current_tenant_id()
    and id <> public.current_profile_id()
  );

-- Company data that carries tenant_id. Same read/write rules production
-- already enforced, but only for the signed-in role and only one company.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects',
    'employees',
    'change_orders',
    'project_budgets',
    'customer_invoices',
    'attachments'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (tenant_id = public.current_tenant_id())',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())',
      t || '_update', t
    );
  end loop;
end $$;

-- Deletes that production limited to masters.
create policy projects_delete on public.projects
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

create policy employees_delete on public.employees
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

create policy change_orders_delete on public.change_orders
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

create policy project_budgets_delete on public.project_budgets
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

create policy customer_invoices_delete on public.customer_invoices
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (uploaded_by = (select auth.uid()) or public.is_master())
  );

-- Costs are entered and removed by people in the company, not only masters.
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

-- No tenant_id of their own. Scope through the parent row the member can see.
create policy change_order_budgets_select on public.change_order_budgets
  for select to authenticated
  using (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ));
create policy change_order_budgets_insert on public.change_order_budgets
  for insert to authenticated
  with check (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ));
create policy change_order_budgets_update on public.change_order_budgets
  for update to authenticated
  using (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ))
  with check (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ));
create policy change_order_budgets_delete on public.change_order_budgets
  for delete to authenticated
  using (
    public.is_master()
    and change_order_id in (
      select c.id from public.change_orders c
      where c.tenant_id = public.current_tenant_id()
    )
  );

do $$
declare
  t text;
begin
  foreach t in array array[
    'labor_costs',
    'material_costs',
    'equipment_costs',
    'other_costs',
    'cap_lease_costs',
    'consumable_costs',
    'subcontractor_costs'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format(
      'create policy %I on public.%I for select to authenticated using (project_id in (select p.id from public.projects p where p.tenant_id = public.current_tenant_id()))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (project_id in (select p.id from public.projects p where p.tenant_id = public.current_tenant_id()))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (project_id in (select p.id from public.projects p where p.tenant_id = public.current_tenant_id())) with check (project_id in (select p.id from public.projects p where p.tenant_id = public.current_tenant_id()))',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (project_id in (select p.id from public.projects p where p.tenant_id = public.current_tenant_id()))',
      t || '_delete', t
    );
  end loop;
end $$;

-- Audit rows are visible inside the company. Inserts must name that company.
-- No update or delete policy: the old "no updates / no deletes" rules stand.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (tenant_id is not null and tenant_id = public.current_tenant_id());

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (user_id is null or user_id = public.current_profile_id())
  );

create policy user_invitations_select on public.user_invitations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy user_invitations_insert on public.user_invitations
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_users_write()
  );

create policy user_invitations_update on public.user_invitations
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_users_write())
  with check (tenant_id = public.current_tenant_id() and public.has_users_write());

create policy user_invitations_delete on public.user_invitations
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_users_write());

-- ---------------------------------------------------------------------------
-- The production view is security definer, owned by postgres, granted to
-- anon, and joins auth.users. Recreate it as security invoker over
-- public.users only, so RLS applies and auth.users is not exposed.
-- The auth columns stay in the view, always null, so existing column lists
-- do not break.
-- ---------------------------------------------------------------------------

drop view if exists public.user_management_view;

create view public.user_management_view
with (security_invoker = true) as
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
  null::timestamp with time zone as last_sign_in_at,
  null::timestamp with time zone as email_confirmed_at,
  case
    when u.force_password_change = true then 'Pending First Login'::text
    when u.last_login is null then 'Never Logged In'::text
    when u.is_active = false then 'Inactive'::text
    else 'Active'::text
  end as status
from public.users u;

revoke all on table public.user_management_view from public, anon;
grant select on table public.user_management_view to authenticated;

commit;

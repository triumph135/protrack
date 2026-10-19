-- ProTrack security hardening
--
-- Safe to re-run. Do NOT apply to production before the matching code
-- changes are deployed (see docs/security-rollout.md).
--
-- What this does:
--   1. Pins search_path on helper functions and removes anon access to them
--   2. Drops the unused SECURITY DEFINER view that exposed auth.users
--   3. Creates the user_invitations table (missing in production today)
--   4. Replaces users and tenants policies, then enables RLS on both
--   5. Blocks privilege escalation: users cannot change their own role,
--      permissions, tenant or status; masters cannot touch billing columns
--   6. Creates a profile row automatically when an auth user is created
--   7. Adds an atomic create_tenant_for_current_user() function

begin;

-- 1. Helper functions ------------------------------------------------------

create or replace function public.get_current_user_tenant_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.is_current_user_master()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role = 'master'
      and is_active = true
      and tenant_id is not null
  );
$$;

alter function public.user_can_access_tenant(uuid) set search_path = public;
alter function public.get_tenant_id_from_project(uuid) set search_path = public;

-- send_user_invitation called a function that does not exist and was
-- callable by anyone. Invitations are now sent from the server.
drop function if exists public.send_user_invitation(text, uuid, text, text);

revoke execute on function public.get_current_user_tenant_id() from public, anon;
revoke execute on function public.is_current_user_master() from public, anon;
revoke execute on function public.user_can_access_tenant(uuid) from public, anon;
revoke execute on function public.get_tenant_id_from_project(uuid) from public, anon;
grant execute on function public.get_current_user_tenant_id() to authenticated, service_role;
grant execute on function public.is_current_user_master() to authenticated, service_role;
grant execute on function public.user_can_access_tenant(uuid) to authenticated, service_role;
grant execute on function public.get_tenant_id_from_project(uuid) to authenticated, service_role;

-- 2. View that exposed auth.users -------------------------------------------

drop view if exists public.user_management_view;

-- 3. Invitations --------------------------------------------------------------

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('master', 'entry', 'view')),
  permissions jsonb not null,
  invited_by uuid references public.users(id) on delete set null,
  invitation_token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_invitations_one_pending_per_email
  on public.user_invitations (tenant_id, lower(email))
  where status = 'pending';
create index if not exists user_invitations_tenant_idx
  on public.user_invitations (tenant_id);

drop trigger if exists update_user_invitations_updated_at on public.user_invitations;
create trigger update_user_invitations_updated_at
  before update on public.user_invitations
  for each row execute function public.update_updated_at_column();

alter table public.user_invitations enable row level security;
revoke all on public.user_invitations from anon;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'user_invitations' loop
    execute format('drop policy %I on public.user_invitations', r.policyname);
  end loop;
end $$;

create policy user_invitations_select_master on public.user_invitations
  for select to authenticated
  using (tenant_id = public.get_current_user_tenant_id() and public.is_current_user_master());

create policy user_invitations_insert_master on public.user_invitations
  for insert to authenticated
  with check (
    tenant_id = public.get_current_user_tenant_id()
    and public.is_current_user_master()
    and invited_by = auth.uid()
  );

create policy user_invitations_update_master on public.user_invitations
  for update to authenticated
  using (tenant_id = public.get_current_user_tenant_id() and public.is_current_user_master())
  with check (tenant_id = public.get_current_user_tenant_id() and public.is_current_user_master());

-- 4. users and tenants policies -----------------------------------------------

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('users', 'tenants') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

revoke all on public.users from anon;
revoke all on public.tenants from anon;

-- Users can read themselves and everyone in their own tenant.
create policy users_select_self_or_tenant on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or (tenant_id is not null and tenant_id = public.get_current_user_tenant_id())
  );

-- Users can edit their own row; a trigger below limits which columns.
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Masters can edit users in their own tenant (role, permissions, status).
create policy users_update_master on public.users
  for update to authenticated
  using (
    tenant_id is not null
    and tenant_id = public.get_current_user_tenant_id()
    and public.is_current_user_master()
  )
  with check (
    tenant_id is not null
    and tenant_id = public.get_current_user_tenant_id()
    and public.is_current_user_master()
  );

-- No insert or delete policies: profiles are created by the auth trigger
-- and by server code using the service role. Users are deactivated, not deleted.

create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = public.get_current_user_tenant_id());

create policy tenants_update_master on public.tenants
  for update to authenticated
  using (id = public.get_current_user_tenant_id() and public.is_current_user_master())
  with check (id = public.get_current_user_tenant_id() and public.is_current_user_master());

-- 5. Privilege escalation guards ----------------------------------------------
-- These only restrict requests made through the public API as a signed in
-- user. Server code (service role), SQL run by the project owner, and the
-- SECURITY DEFINER functions in this file are not affected.

create or replace function public.guard_users_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.email is distinct from old.email then
    raise exception 'id, tenant_id and email cannot be changed' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.permissions is distinct from old.permissions
     or new.is_active is distinct from old.is_active then
    if old.id = auth.uid() then
      raise exception 'You cannot change your own role, permissions or status'
        using errcode = '42501';
    end if;
    if not (public.is_current_user_master()
            and old.tenant_id is not null
            and old.tenant_id = public.get_current_user_tenant_id()) then
      raise exception 'Only an admin can change roles, permissions or status'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists guard_users_privileged_columns on public.users;
create trigger guard_users_privileged_columns
  before update on public.users
  for each row execute function public.guard_users_privileged_columns();

create or replace function public.guard_tenants_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.subdomain is distinct from old.subdomain
     or new.plan is distinct from old.plan
     or new.status is distinct from old.status
     or new.subscription_ends_at is distinct from old.subscription_ends_at
     or new.billing_info is distinct from old.billing_info then
    raise exception 'Plan, status and billing fields can only be changed by the system'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists guard_tenants_billing_columns on public.tenants;
create trigger guard_tenants_billing_columns
  before update on public.tenants
  for each row execute function public.guard_tenants_billing_columns();

-- 6. Automatic profile row for every new auth user ----------------------------
-- Starts with no tenant and no access. The tenant setup function or the
-- invitation flow grants access afterwards.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role, tenant_id, permissions, is_active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    'view',
    null,
    jsonb_build_object(
      'material', 'none', 'labor', 'none', 'equipment', 'none',
      'subcontractor', 'none', 'others', 'none', 'capLeases', 'none',
      'consumable', 'none', 'invoices', 'none', 'projects', 'none',
      'users', 'none'
    ),
    true
  )
  on conflict (id) do nothing;
  return new;
end $$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 7. Atomic tenant creation ---------------------------------------------------
-- One transaction: creates the company and makes the caller its admin.

create or replace function public.create_tenant_for_current_user(
  p_name text,
  p_subdomain text,
  p_email text,
  p_phone text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_subdomain text := lower(trim(p_subdomain));
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.users where id = v_uid) then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.users where id = v_uid and tenant_id is not null) then
    raise exception 'You already belong to an organization' using errcode = '23505';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Company name is required' using errcode = '22023';
  end if;
  if v_subdomain !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' then
    raise exception 'Subdomain must be 3 to 30 letters, numbers or dashes' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenants where subdomain = v_subdomain) then
    raise exception 'That subdomain is already taken' using errcode = '23505';
  end if;

  insert into public.tenants (subdomain, name, email, phone, status, plan)
  values (v_subdomain, trim(p_name), p_email, p_phone, 'active', 'trial')
  returning id into v_tenant_id;

  update public.users
  set tenant_id = v_tenant_id,
      role = 'master',
      is_active = true,
      permissions = jsonb_build_object(
        'material', 'write', 'labor', 'write', 'equipment', 'write',
        'subcontractor', 'write', 'others', 'write', 'capLeases', 'write',
        'consumable', 'write', 'invoices', 'write', 'projects', 'write',
        'users', 'write'
      )
  where id = v_uid;

  return v_tenant_id;
end $$;

revoke execute on function public.create_tenant_for_current_user(text, text, text, text) from public, anon;
grant execute on function public.create_tenant_for_current_user(text, text, text, text) to authenticated;

-- 8. Turn RLS on last -----------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.users enable row level security;

commit;

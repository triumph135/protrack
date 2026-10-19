-- ProTrack security hardening, part 2 of 2: lockdown
--
-- Run ONLY AFTER part 1 is applied and the matching application code is
-- deployed (see docs/security-rollout.md). This turns on Row Level Security
-- for users and tenants and blocks the browser from changing roles, tenants
-- or billing fields.
--
-- Safe to re-run.

begin;

-- send_user_invitation called a function that does not exist and was
-- callable by anyone. Invitations are now sent from the server.
drop function if exists public.send_user_invitation(text, uuid, text, text);

-- 2. View that exposed auth.users -------------------------------------------

drop view if exists public.user_management_view;

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

-- 8. Turn RLS on last -----------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.users enable row level security;

commit;

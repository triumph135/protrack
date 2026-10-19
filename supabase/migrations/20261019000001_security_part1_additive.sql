-- ProTrack security hardening, part 1 of 2: additive changes
--
-- Safe to run BEFORE the new application code is deployed. Nothing here
-- removes or restricts anything the current app relies on. It adds:
--   * the user_invitations table (missing in production today)
--   * the atomic create_tenant_for_current_user() function
--   * pinned search_path and no anonymous access on helper functions
--
-- Safe to re-run.

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

-- These two exist in production but not in every environment.
do $$
begin
  if to_regprocedure('public.user_can_access_tenant(uuid)') is not null then
    alter function public.user_can_access_tenant(uuid) set search_path = public;
    revoke execute on function public.user_can_access_tenant(uuid) from public, anon;
    grant execute on function public.user_can_access_tenant(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('public.get_tenant_id_from_project(uuid)') is not null then
    alter function public.get_tenant_id_from_project(uuid) set search_path = public;
    revoke execute on function public.get_tenant_id_from_project(uuid) from public, anon;
    grant execute on function public.get_tenant_id_from_project(uuid) to authenticated, service_role;
  end if;
end $$;


revoke execute on function public.get_current_user_tenant_id() from public, anon;
revoke execute on function public.is_current_user_master() from public, anon;
grant execute on function public.get_current_user_tenant_id() to authenticated, service_role;
grant execute on function public.is_current_user_master() to authenticated, service_role;

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
  -- Make sure the caller has a profile row (the lockdown migration adds a
  -- trigger that normally does this at signup).
  insert into public.users (id, email, name, role, tenant_id, permissions, is_active)
  select au.id, au.email,
         coalesce(nullif(au.raw_user_meta_data ->> 'name', ''), split_part(au.email, '@', 1)),
         'view', null,
         jsonb_build_object(
           'material', 'none', 'labor', 'none', 'equipment', 'none',
           'subcontractor', 'none', 'others', 'none', 'capLeases', 'none',
           'consumable', 'none', 'invoices', 'none', 'projects', 'none',
           'users', 'none'
         ),
         true
  from auth.users au
  where au.id = v_uid
  on conflict (id) do nothing;
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
  values (v_subdomain, trim(p_name), p_email, p_phone, 'active', 'starter')
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

commit;

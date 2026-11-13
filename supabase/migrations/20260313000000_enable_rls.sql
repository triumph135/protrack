# Apply in the Supabase SQL editor. Run once, in a staging project first.
#
# This turns on row level security so a signed-in user can only see rows for
# their own organization. The browser anon key is not a security boundary.
# Service-role API routes bypass these policies.
#
# After this migration:
# - New workspaces should be created with public.create_workspace().
# - Existing users should join with public.accept_tenant_invitation(token).
# - The app calls those functions and falls back to the old client writes only
#   when the functions are not installed yet.
# - password_hash is revoked from the browser roles. Stop selecting it.
# - Each login can belong to one organization (users.id is the auth user id).

create or replace function public.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id::text from public.users where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.has_users_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select role = 'master' or coalesce(permissions->>'users', 'none') = 'write'
    from public.users
    where id = auth.uid()
  ), false)
$$;

revoke all on function public.current_tenant_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.has_users_write() from public;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.has_users_write() to authenticated;

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

  select * into v_user from public.users where id = auth.uid();
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
  where id = auth.uid()
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

  select * into v_user from public.users where id = auth.uid();
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
  where id = auth.uid()
    and tenant_id is null;

  update public.user_invitations
  set status = 'accepted', updated_at = now()
  where id = v_invite.id;

  return jsonb_build_object('tenant_id', v_invite.tenant_id, 'role', v_invite.role);
end;
$$;

revoke all on function public.create_workspace(text, text, text, text, text) from public;
revoke all on function public.accept_tenant_invitation(text) from public;
grant execute on function public.create_workspace(text, text, text, text, text) to authenticated;
grant execute on function public.accept_tenant_invitation(text) to authenticated;

-- Hide leftover password hashes from the browser. Auth lives in Supabase Auth.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'password_hash'
  ) then
    execute 'revoke select (password_hash) on table public.users from anon, authenticated';
  end if;
end $$;

-- Tenant-scoped tables. Re-running drops and recreates the policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects',
    'project_costs',
    'project_budgets',
    'change_orders',
    'customer_invoices',
    'employees',
    'attachments',
    'audit_logs'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Skipping missing table %', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (tenant_id::text = public.current_tenant_id())',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (tenant_id::text = public.current_tenant_id())',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (tenant_id::text = public.current_tenant_id()) with check (tenant_id::text = public.current_tenant_id())',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (tenant_id::text = public.current_tenant_id())',
      t || '_delete', t
    );
    execute format('create index if not exists %I on public.%I (tenant_id)', t || '_tenant_id_idx', t);
  end loop;
end $$;

-- Legacy cost table with no tenant_id of its own.
do $$
begin
  if to_regclass('public.cap_lease_costs') is null then
    return;
  end if;

  alter table public.cap_lease_costs enable row level security;
  drop policy if exists cap_lease_costs_select on public.cap_lease_costs;
  drop policy if exists cap_lease_costs_insert on public.cap_lease_costs;
  drop policy if exists cap_lease_costs_update on public.cap_lease_costs;
  drop policy if exists cap_lease_costs_delete on public.cap_lease_costs;

  create policy cap_lease_costs_select on public.cap_lease_costs
    for select to authenticated
    using (exists (
      select 1 from public.projects p
      where p.id = cap_lease_costs.project_id
        and p.tenant_id::text = public.current_tenant_id()
    ));
  create policy cap_lease_costs_insert on public.cap_lease_costs
    for insert to authenticated
    with check (exists (
      select 1 from public.projects p
      where p.id = cap_lease_costs.project_id
        and p.tenant_id::text = public.current_tenant_id()
    ));
  create policy cap_lease_costs_update on public.cap_lease_costs
    for update to authenticated
    using (exists (
      select 1 from public.projects p
      where p.id = cap_lease_costs.project_id
        and p.tenant_id::text = public.current_tenant_id()
    ))
    with check (exists (
      select 1 from public.projects p
      where p.id = cap_lease_costs.project_id
        and p.tenant_id::text = public.current_tenant_id()
    ));
  create policy cap_lease_costs_delete on public.cap_lease_costs
    for delete to authenticated
    using (exists (
      select 1 from public.projects p
      where p.id = cap_lease_costs.project_id
        and p.tenant_id::text = public.current_tenant_id()
    ));
end $$;

alter table public.tenants enable row level security;
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated
  using (id::text = public.current_tenant_id());

alter table public.users enable row level security;
drop policy if exists users_select on public.users;
drop policy if exists users_insert on public.users;
drop policy if exists users_update on public.users;

create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or tenant_id::text = public.current_tenant_id()
  );

-- Signup may create only an unscoped entry profile for the signed-in user.
create policy users_insert on public.users
  for insert to authenticated
  with check (
    id = auth.uid()
    and tenant_id is null
    and role = 'entry'
  );

-- Managers can edit people in their organization, including roles.
-- Everyone else can edit only their own row, and cannot change role,
-- permissions, or organization. Moving between organizations is done by
-- create_workspace() and accept_tenant_invitation().
create policy users_update on public.users
  for update to authenticated
  using (
    id = auth.uid()
    or (tenant_id::text = public.current_tenant_id() and public.has_users_write())
  )
  with check (
    (
      public.has_users_write()
      and tenant_id::text = public.current_tenant_id()
    )
    or (
      id = auth.uid()
      and tenant_id::text is not distinct from public.current_tenant_id()
      and role = public.current_user_role()
      and permissions is not distinct from (select u.permissions from public.users u where u.id = auth.uid())
    )
  );

do $$
begin
  if to_regclass('public.user_invitations') is null then
    raise notice 'user_invitations is missing; invitation policies were skipped';
    return;
  end if;

  alter table public.user_invitations enable row level security;
  drop policy if exists user_invitations_select on public.user_invitations;
  drop policy if exists user_invitations_insert on public.user_invitations;
  drop policy if exists user_invitations_update on public.user_invitations;
  drop policy if exists user_invitations_delete on public.user_invitations;

  create policy user_invitations_select on public.user_invitations
    for select to authenticated
    using (tenant_id::text = public.current_tenant_id());
  create policy user_invitations_insert on public.user_invitations
    for insert to authenticated
    with check (tenant_id::text = public.current_tenant_id() and public.has_users_write());
  create policy user_invitations_update on public.user_invitations
    for update to authenticated
    using (tenant_id::text = public.current_tenant_id() and public.has_users_write())
    with check (tenant_id::text = public.current_tenant_id() and public.has_users_write());
  create policy user_invitations_delete on public.user_invitations
    for delete to authenticated
    using (tenant_id::text = public.current_tenant_id() and public.has_users_write());
end $$;

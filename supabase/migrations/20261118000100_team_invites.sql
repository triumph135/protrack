-- Phase 2: team invites.
--
-- Purpose
--   Email invites and reusable invite links share user_invitations.
--   accept_tenant_invitation keeps its signature and also creates a profile
--   when the auth user has none. The last active master of a company cannot
--   be demoted, deactivated, or deleted. Sends are rate limited.
--
-- Assumes
--   20261113201043_enable_rls.sql created user_invitations and the original
--   accept_tenant_invitation(text). Safe to run twice. One transaction.
--
-- Verify
--   supabase/tests/phase2_checks.sql covers email accept, link max uses,
--   revoked and expired tokens, the rate limit, a missing profile, a user
--   who already belongs to a company, and last-master protection.

begin;

alter table public.user_invitations
  add column if not exists invite_type text not null default 'email';
alter table public.user_invitations
  add column if not exists max_uses int;
alter table public.user_invitations
  add column if not exists use_count int not null default 0;
alter table public.user_invitations
  add column if not exists accepted_by uuid;
alter table public.user_invitations
  add column if not exists accepted_at timestamptz;
alter table public.user_invitations
  add column if not exists revoked_at timestamptz;
alter table public.user_invitations
  add column if not exists last_sent_at timestamptz;
alter table public.user_invitations
  add column if not exists send_count int not null default 0;

alter table public.user_invitations alter column email drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_invitations_invite_type_check'
  ) then
    alter table public.user_invitations
      add constraint user_invitations_invite_type_check
      check (invite_type in ('email', 'link'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_invitations_email_required'
  ) then
    alter table public.user_invitations
      add constraint user_invitations_email_required
      check (invite_type = 'link' or email is not null);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_invitations_status_check'
  ) then
    alter table public.user_invitations
      add constraint user_invitations_status_check
      check (status in ('pending', 'accepted', 'expired', 'revoked'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_invitations_accepted_by_fkey'
  ) then
    alter table public.user_invitations
      add constraint user_invitations_accepted_by_fkey
      foreign key (accepted_by) references public.users(id) on delete set null;
  end if;
end $$;

create table if not exists public.invitation_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invitation_id uuid not null references public.user_invitations(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists invitation_sends_tenant_sent_idx
  on public.invitation_sends (tenant_id, sent_at);
create index if not exists invitation_sends_invitation_sent_idx
  on public.invitation_sends (invitation_id, sent_at);

alter table public.invitation_sends enable row level security;

drop policy if exists invitation_sends_select on public.invitation_sends;
create policy invitation_sends_select on public.invitation_sends
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_users_write());

revoke all on table public.invitation_sends from public, anon, authenticated;
grant select on table public.invitation_sends to authenticated;

create or replace function public.register_invitation_send(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.user_invitations%rowtype;
  v_hour integer;
  v_day integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_users_write() then
    raise exception 'You do not have permission to send invitations';
  end if;

  select * into v_invite
  from public.user_invitations
  where id = p_invitation_id
    and tenant_id = public.current_tenant_id()
  for update;

  if v_invite.id is null then
    raise exception 'Invitation not found';
  end if;
  if v_invite.status <> 'pending' or v_invite.revoked_at is not null then
    raise exception 'This invitation can no longer be sent';
  end if;

  select count(*) into v_hour
  from public.invitation_sends
  where tenant_id = v_invite.tenant_id
    and sent_at > now() - interval '1 hour';
  if v_hour >= 30 then
    raise exception 'Invite limit reached: 30 sends per company per hour';
  end if;

  select count(*) into v_day
  from public.invitation_sends
  where invitation_id = v_invite.id
    and sent_at > now() - interval '1 day';
  if v_day >= 5 then
    raise exception 'This invite can be sent at most 5 times per day';
  end if;

  insert into public.invitation_sends (tenant_id, invitation_id)
  values (v_invite.tenant_id, v_invite.id);

  update public.user_invitations
  set send_count = send_count + 1,
      last_sent_at = now(),
      updated_at = now()
  where id = v_invite.id;
end;
$$;

create or replace function public.accept_tenant_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := public.current_user_email();
  v_user public.users%rowtype;
  v_invite public.user_invitations%rowtype;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
  from public.user_invitations
  where invitation_token = p_token
  for update;

  if v_invite.id is null then
    raise exception 'Invitation not found or already used';
  end if;
  if v_invite.status = 'revoked' or v_invite.revoked_at is not null then
    raise exception 'Invitation has been revoked';
  end if;
  if v_invite.status = 'expired' or v_invite.expires_at < now() then
    update public.user_invitations
    set status = 'expired', updated_at = now()
    where id = v_invite.id
      and status = 'pending';
    raise exception 'Invitation has expired';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'Invitation not found or already used';
  end if;

  if coalesce(v_invite.invite_type, 'email') = 'link' then
    if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
      raise exception 'This invite link has reached its maximum number of uses';
    end if;
  else
    if v_email is null or lower(v_invite.email) <> v_email then
      raise exception 'This invitation is for a different email address';
    end if;
  end if;

  select * into v_user from public.users where id = v_uid;
  if v_user.id is null then
    select * into v_user from public.users where id = public.current_profile_id();
  end if;

  if v_user.id is null then
    if v_email is null then
      raise exception 'Profile not found';
    end if;
    v_name := coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
      nullif(auth.jwt() ->> 'name', ''),
      nullif(split_part(v_email, '@', 1), ''),
      'Member'
    );
    insert into public.users (id, name, email, role, permissions, is_active, tenant_id)
    values (v_uid, v_name, v_email, 'entry', '{}'::jsonb, true, null)
    returning * into v_user;
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
    permissions = coalesce(v_invite.permissions, '{}'::jsonb),
    is_active = true
  where id = v_user.id
    and tenant_id is null;

  if not found then
    raise exception 'Could not join this organization';
  end if;

  if coalesce(v_invite.invite_type, 'email') = 'link' then
    update public.user_invitations
    set
      use_count = use_count + 1,
      accepted_by = v_user.id,
      accepted_at = now(),
      status = case
        when max_uses is not null and use_count + 1 >= max_uses then 'accepted'
        else status
      end,
      updated_at = now()
    where id = v_invite.id;
  else
    update public.user_invitations
    set
      status = 'accepted',
      accepted_by = v_user.id,
      accepted_at = now(),
      use_count = use_count + 1,
      updated_at = now()
    where id = v_invite.id;
  end if;

  return jsonb_build_object('tenant_id', v_invite.tenant_id, 'role', v_invite.role);
end;
$$;

create or replace function public.protect_last_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'master' and coalesce(old.is_active, false) and old.tenant_id is not null then
      select count(*) into v_remaining
      from public.users
      where tenant_id = old.tenant_id
        and role = 'master'
        and coalesce(is_active, false)
        and id <> old.id;
      if v_remaining = 0 then
        raise exception 'This company needs at least one active master';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'master'
     and coalesce(old.is_active, false)
     and old.tenant_id is not null
     and (
       new.role is distinct from 'master'
       or coalesce(new.is_active, false) = false
       or new.tenant_id is distinct from old.tenant_id
     ) then
    select count(*) into v_remaining
    from public.users
    where tenant_id = old.tenant_id
      and role = 'master'
      and coalesce(is_active, false)
      and id <> old.id;
    if v_remaining = 0 then
      raise exception 'This company needs at least one active master';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_protect_last_master on public.users;
create trigger users_protect_last_master
  before update or delete on public.users
  for each row execute function public.protect_last_master();

revoke all on function public.register_invitation_send(uuid) from public, anon;
revoke all on function public.accept_tenant_invitation(text) from public, anon;
revoke all on function public.protect_last_master() from public, anon;
grant execute on function public.register_invitation_send(uuid) to authenticated;
grant execute on function public.accept_tenant_invitation(text) to authenticated;
grant execute on function public.protect_last_master() to authenticated;

commit;

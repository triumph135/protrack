-- Rolls back 20261118000100_team_invites.sql.
-- Restores accept_tenant_invitation from 20261113201043_enable_rls.sql.
-- Link invites created after that migration have no email; those rows are
-- removed so email can be NOT NULL again. Email invites keep their original
-- columns. use_count and the other new columns are dropped.

begin;

drop trigger if exists users_protect_last_master on public.users;

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

revoke all on function public.accept_tenant_invitation(text) from public, anon;
grant execute on function public.accept_tenant_invitation(text) to authenticated;

drop function if exists public.register_invitation_send(uuid);
drop function if exists public.protect_last_master();
drop table if exists public.invitation_sends;

delete from public.user_invitations where email is null;

alter table public.user_invitations drop constraint if exists user_invitations_invite_type_check;
alter table public.user_invitations drop constraint if exists user_invitations_email_required;
alter table public.user_invitations drop constraint if exists user_invitations_status_check;
alter table public.user_invitations drop constraint if exists user_invitations_accepted_by_fkey;

alter table public.user_invitations drop column if exists invite_type;
alter table public.user_invitations drop column if exists max_uses;
alter table public.user_invitations drop column if exists use_count;
alter table public.user_invitations drop column if exists accepted_by;
alter table public.user_invitations drop column if exists accepted_at;
alter table public.user_invitations drop column if exists revoked_at;
alter table public.user_invitations drop column if exists last_sent_at;
alter table public.user_invitations drop column if exists send_count;

alter table public.user_invitations alter column email set not null;

commit;

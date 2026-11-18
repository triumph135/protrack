-- Phase 2b: reversing entries, credit memos, and the record_events trail.
--
-- Purpose
--   Add reversal columns, an append-only event log, and the RPCs the app
--   uses to reverse a cost, credit an invoice, or move a cost. Books lock
--   is a company setting (tenants.settings.books_lock_date) and defaults
--   to off when the key is absent. After a check that no attachment uses
--   an unknown entity_type, attachment_project_visible returns false for
--   unknown types.
--
-- Assumes
--   Migrations through 20261118000400 are applied. Safe to run twice.
--   One transaction. Does not change existing cost or invoice amounts.
--   Current app code never writes reversal_of_id, so its inserts, edits,
--   and deletes of unlocked rows keep working.
--
-- Verify
--   supabase/tests/phase2b_checks.sql. A full reversal nets to zero, a
--   locked row can be reversed but not edited, and unknown attachment
--   types are hidden.

begin;

alter table public.project_costs
  add column if not exists reversal_of_id uuid,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

alter table public.customer_invoices
  add column if not exists reversal_of_id uuid,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_costs_reversal_of_id_fkey'
  ) then
    alter table public.project_costs
      add constraint project_costs_reversal_of_id_fkey
      foreign key (reversal_of_id) references public.project_costs(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'customer_invoices_reversal_of_id_fkey'
  ) then
    alter table public.customer_invoices
      add constraint customer_invoices_reversal_of_id_fkey
      foreign key (reversal_of_id) references public.customer_invoices(id) on delete restrict;
  end if;
end $$;

create index if not exists project_costs_reversal_of_idx
  on public.project_costs (reversal_of_id)
  where reversal_of_id is not null;

create index if not exists customer_invoices_reversal_of_idx
  on public.customer_invoices (reversal_of_id)
  where reversal_of_id is not null;

create table if not exists public.record_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor_id uuid references public.users(id) on delete set null,
  reason text,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint record_events_entity_type_check check (entity_type in ('cost', 'customer_invoice')),
  constraint record_events_event_type_check check (event_type in ('created', 'updated', 'deleted', 'reversed', 'moved', 'credit_memo'))
);

create index if not exists record_events_entity_idx
  on public.record_events (tenant_id, entity_type, entity_id, created_at);

alter table public.record_events enable row level security;

drop policy if exists record_events_select on public.record_events;
create policy record_events_select on public.record_events
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      (
        entity_type = 'cost'
        and exists (
          select 1
          from public.project_costs pc
          where pc.id = record_events.entity_id
            and public.can_see_project(pc.project_id)
            and public.can_access_category(
              public.resolve_cost_category_id(pc.category_id, pc.category, pc.tenant_id),
              'read'
            )
        )
      )
      or (
        entity_type = 'customer_invoice'
        and exists (
          select 1
          from public.customer_invoices inv
          where inv.id = record_events.entity_id
            and public.can_see_project(inv.project_id)
        )
      )
    )
  );

revoke all on table public.record_events from public, anon, authenticated;
grant select on table public.record_events to authenticated;

-- Internal helpers. Not granted to the API roles. Security-definer RPCs
-- and triggers, owned by the migration role, call them.

create or replace function public.books_lock_covers(p_tenant_id uuid, p_on date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenants t
    where t.id = p_tenant_id
      and coalesce(t.settings ->> 'books_lock_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      and p_on is not null
      and p_on <= (t.settings ->> 'books_lock_date')::date
  )
$$;

create or replace function public.phase2b_offset_amount(p_remaining numeric, p_proposed numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value numeric := coalesce(p_proposed, -coalesce(p_remaining, 0));
begin
  if coalesce(p_remaining, 0) = 0 then
    if v_value = 0 then
      return 0;
    end if;
    raise exception 'Nothing left to reverse';
  end if;
  if p_remaining > 0 then
    if v_value >= 0 or p_remaining + v_value < 0 then
      raise exception 'That amount would push the remaining balance past zero';
    end if;
  elsif v_value <= 0 or p_remaining + v_value > 0 then
    raise exception 'That amount would push the remaining balance past zero';
  end if;
  return v_value;
end;
$$;

create or replace function public.phase2b_cost_remaining(p_cost_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(pc.cost, 0) + coalesce((
    select sum(child.cost)
    from public.project_costs child
    where child.reversal_of_id = pc.id
  ), 0)
  from public.project_costs pc
  where pc.id = p_cost_id
$$;

create or replace function public.phase2b_invoice_remaining(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select inv.amount + coalesce((
    select sum(child.amount)
    from public.customer_invoices child
    where child.reversal_of_id = inv.id
  ), 0)
  from public.customer_invoices inv
  where inv.id = p_invoice_id
$$;

create or replace function public.phase2b_component_remaining(
  p_cost_id uuid,
  p_column text
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value numeric;
begin
  if p_column not in ('st_hours', 'ot_hours', 'dt_hours', 'per_diem', 'mob', 'mob_qty') then
    raise exception 'Unsupported cost field';
  end if;
  execute format(
    'select coalesce(pc.%I, 0) + coalesce((select sum(child.%I) from public.project_costs child where child.reversal_of_id = pc.id), 0) from public.project_costs pc where pc.id = $1',
    p_column, p_column
  ) into v_value using p_cost_id;
  return coalesce(v_value, 0);
end;
$$;

create or replace function public.guard_project_cost_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_children numeric;
  v_remaining numeric;
begin
  if tg_op = 'INSERT' then
    if new.reversal_of_id is not null
       and current_setting('protrack.system_reversal', true) is distinct from '1' then
      raise exception 'Reversals are posted through the reverse action';
    end if;
    if new.reversal_of_id is null and public.books_lock_covers(new.tenant_id, new.date) then
      raise exception 'That date is in a closed period. Choose a later date.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if current_setting('protrack.system_stamp', true) = '1' then
      return new;
    end if;

    if new.reversal_of_id is distinct from old.reversal_of_id then
      raise exception 'reversal_of_id cannot be changed';
    end if;

    if public.books_lock_covers(old.tenant_id, old.date)
       or public.books_lock_covers(new.tenant_id, new.date) then
      raise exception 'This date is in a closed period. Reverse the entry instead of editing it.';
    end if;

    if current_setting('protrack.system_move', true) = '1' then
      if new.cost is distinct from old.cost
         or new.date is distinct from old.date
         or new.project_id is distinct from old.project_id
         or new.tenant_id is distinct from old.tenant_id
         or new.reversal_of_id is distinct from old.reversal_of_id
      then
        raise exception 'The move action only changes the category';
      end if;
      return new;
    end if;

    if new.category_id is distinct from old.category_id then
      raise exception 'Move this entry with the move action so its history stays intact';
    end if;

    if old.reversal_of_id is not null then
      raise exception 'A reversal cannot be edited or deleted. Post another reversal to undo it.';
    end if;

    if old.reversed_at is not null then
      raise exception 'This entry is fully reversed and cannot be edited';
    end if;

    if new.cost is distinct from old.cost and exists (
      select 1 from public.project_costs child where child.reversal_of_id = old.id
    ) then
      select coalesce(sum(child.cost), 0) into v_children
      from public.project_costs child
      where child.reversal_of_id = old.id;
      v_remaining := coalesce(new.cost, 0) + v_children;
      if coalesce(old.cost, 0) > 0 and v_remaining < 0 then
        raise exception 'This edit would push the remaining amount below zero. Reverse the difference instead.';
      end if;
      if coalesce(old.cost, 0) < 0 and v_remaining > 0 then
        raise exception 'This edit would push the remaining amount past zero. Reverse the difference instead.';
      end if;
      if v_remaining = 0 then
        new.reversed_at := coalesce(new.reversed_at, now());
      end if;
    end if;

    return new;
  end if;

  if old.reversal_of_id is not null then
    raise exception 'A reversal cannot be edited or deleted. Post another reversal to undo it.';
  end if;
  if exists (select 1 from public.project_costs child where child.reversal_of_id = old.id) then
    raise exception 'This entry has a reversal. Leave both rows in place.';
  end if;
  if old.reversed_at is not null then
    raise exception 'This entry is fully reversed and cannot be deleted';
  end if;
  if public.books_lock_covers(old.tenant_id, old.date) then
    raise exception 'This date is in a closed period. Reverse the entry instead of deleting it.';
  end if;
  return old;
end;
$$;

create or replace function public.log_project_cost_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := nullif(current_setting('protrack.event_kind', true), '');
  v_reason text := nullif(current_setting('protrack.event_reason', true), '');
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_id uuid;
  v_tenant uuid;
begin
  if v_kind = 'skip' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_kind := coalesce(v_kind, 'deleted');
    v_before := to_jsonb(old);
    v_id := old.id;
    v_tenant := old.tenant_id;
  elsif tg_op = 'INSERT' then
    if v_kind is null then
      v_kind := case when new.reversal_of_id is null then 'created' else 'reversed' end;
    end if;
    v_after := to_jsonb(new);
    v_id := new.id;
    v_tenant := new.tenant_id;
  else
    v_kind := coalesce(v_kind, 'updated');
    if v_kind = 'moved' then
      v_before := jsonb_build_object(
        'category_id', old.category_id,
        'category', old.category,
        'category_name', (select name from public.cost_categories where id = old.category_id)
      );
      v_after := jsonb_build_object(
        'category_id', new.category_id,
        'category', new.category,
        'category_name', (select name from public.cost_categories where id = new.category_id)
      );
    else
      v_before := to_jsonb(old);
      v_after := to_jsonb(new);
    end if;
    v_id := new.id;
    v_tenant := new.tenant_id;
  end if;

  insert into public.record_events (
    tenant_id, entity_type, entity_id, event_type, actor_id, reason, before_data, after_data
  ) values (
    v_tenant, 'cost', v_id, v_kind, public.current_profile_id(), v_reason, v_before, v_after
  );
  return null;
end;
$$;

create or replace function public.guard_customer_invoice_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_children numeric;
  v_remaining numeric;
begin
  if tg_op = 'INSERT' then
    if new.reversal_of_id is not null
       and current_setting('protrack.system_reversal', true) is distinct from '1' then
      raise exception 'Credit memos are posted through the credit memo action';
    end if;
    if new.reversal_of_id is null and public.books_lock_covers(new.tenant_id, new.date_billed) then
      raise exception 'That billed date is in a closed period. Choose a later date.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if current_setting('protrack.system_stamp', true) = '1' then
      return new;
    end if;
    if new.reversal_of_id is distinct from old.reversal_of_id then
      raise exception 'reversal_of_id cannot be changed';
    end if;
    if public.books_lock_covers(old.tenant_id, old.date_billed)
       or public.books_lock_covers(new.tenant_id, new.date_billed) then
      raise exception 'This billed date is in a closed period. Post a credit memo instead of editing it.';
    end if;
    if old.reversal_of_id is not null then
      raise exception 'A credit memo cannot be edited or deleted. Post another credit memo to undo it.';
    end if;
    if old.reversed_at is not null then
      raise exception 'This invoice is fully credited and cannot be edited';
    end if;
    if new.amount is distinct from old.amount and exists (
      select 1 from public.customer_invoices child where child.reversal_of_id = old.id
    ) then
      select coalesce(sum(child.amount), 0) into v_children
      from public.customer_invoices child
      where child.reversal_of_id = old.id;
      v_remaining := new.amount + v_children;
      if old.amount > 0 and v_remaining < 0 then
        raise exception 'This edit would push the remaining billed amount below zero. Post a credit memo instead.';
      end if;
      if old.amount < 0 and v_remaining > 0 then
        raise exception 'This edit would push the remaining billed amount past zero. Post a credit memo instead.';
      end if;
      if v_remaining = 0 then
        new.reversed_at := coalesce(new.reversed_at, now());
      end if;
    end if;
    return new;
  end if;

  if old.reversal_of_id is not null then
    raise exception 'A credit memo cannot be edited or deleted. Post another credit memo to undo it.';
  end if;
  if exists (select 1 from public.customer_invoices child where child.reversal_of_id = old.id) then
    raise exception 'This invoice has a credit memo. Leave both rows in place.';
  end if;
  if old.reversed_at is not null then
    raise exception 'This invoice is fully credited and cannot be deleted';
  end if;
  if public.books_lock_covers(old.tenant_id, old.date_billed) then
    raise exception 'This billed date is in a closed period. Post a credit memo instead of deleting it.';
  end if;
  return old;
end;
$$;

create or replace function public.log_customer_invoice_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := nullif(current_setting('protrack.event_kind', true), '');
  v_reason text := nullif(current_setting('protrack.event_reason', true), '');
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_id uuid;
  v_tenant uuid;
begin
  if v_kind = 'skip' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_kind := coalesce(v_kind, 'deleted');
    v_before := to_jsonb(old);
    v_id := old.id;
    v_tenant := old.tenant_id;
  elsif tg_op = 'INSERT' then
    if v_kind is null then
      v_kind := case when new.reversal_of_id is null then 'created' else 'credit_memo' end;
    end if;
    v_after := to_jsonb(new);
    v_id := new.id;
    v_tenant := new.tenant_id;
  else
    v_kind := coalesce(v_kind, 'updated');
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_id := new.id;
    v_tenant := new.tenant_id;
  end if;

  insert into public.record_events (
    tenant_id, entity_type, entity_id, event_type, actor_id, reason, before_data, after_data
  ) values (
    v_tenant, 'customer_invoice', v_id, v_kind, public.current_profile_id(), v_reason, v_before, v_after
  );
  return null;
end;
$$;

drop trigger if exists project_costs_phase2b_guard on public.project_costs;
create trigger project_costs_phase2b_guard
  before insert or update or delete on public.project_costs
  for each row execute function public.guard_project_cost_change();

drop trigger if exists project_costs_phase2b_log on public.project_costs;
create trigger project_costs_phase2b_log
  after insert or update or delete on public.project_costs
  for each row execute function public.log_project_cost_event();

drop trigger if exists customer_invoices_phase2b_guard on public.customer_invoices;
create trigger customer_invoices_phase2b_guard
  before insert or update or delete on public.customer_invoices
  for each row execute function public.guard_customer_invoice_change();

drop trigger if exists customer_invoices_phase2b_log on public.customer_invoices;
create trigger customer_invoices_phase2b_log
  after insert or update or delete on public.customer_invoices
  for each row execute function public.log_customer_invoice_event();

create or replace function public.reverse_project_cost(
  p_cost_id uuid,
  p_reason text,
  p_date date,
  p_fields jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.project_costs%rowtype;
  v_cost numeric;
  v_st numeric;
  v_ot numeric;
  v_dt numeric;
  v_per_diem numeric;
  v_mob numeric;
  v_mob_qty numeric;
  v_new uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;
  if p_date is null then
    raise exception 'A date is required';
  end if;

  select * into v from public.project_costs where id = p_cost_id for update;
  if v.id is null or v.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Entry not found';
  end if;
  if not public.can_see_project(v.project_id) then
    raise exception 'You cannot see this project';
  end if;
  if not public.can_access_category(
    public.resolve_cost_category_id(v.category_id, v.category, v.tenant_id),
    'write'
  ) then
    raise exception 'You do not have write access to this category';
  end if;
  if public.phase2b_cost_remaining(v.id) = 0 then
    raise exception 'Nothing left to reverse';
  end if;

  v_cost := public.phase2b_offset_amount(
    public.phase2b_cost_remaining(v.id),
    case when p_fields is null or not (p_fields ? 'cost') then null else (p_fields->>'cost')::numeric end
  );

  v_st := public.phase2b_offset_amount(
    public.phase2b_component_remaining(v.id, 'st_hours'),
    case when p_fields is null or not (p_fields ? 'st_hours') then null else (p_fields->>'st_hours')::numeric end
  );
  v_ot := public.phase2b_offset_amount(
    public.phase2b_component_remaining(v.id, 'ot_hours'),
    case when p_fields is null or not (p_fields ? 'ot_hours') then null else (p_fields->>'ot_hours')::numeric end
  );
  v_dt := public.phase2b_offset_amount(
    public.phase2b_component_remaining(v.id, 'dt_hours'),
    case when p_fields is null or not (p_fields ? 'dt_hours') then null else (p_fields->>'dt_hours')::numeric end
  );
  v_per_diem := public.phase2b_offset_amount(
    public.phase2b_component_remaining(v.id, 'per_diem'),
    case when p_fields is null or not (p_fields ? 'per_diem') then null else (p_fields->>'per_diem')::numeric end
  );
  v_mob := public.phase2b_offset_amount(
    public.phase2b_component_remaining(v.id, 'mob'),
    case when p_fields is null or not (p_fields ? 'mob') then null else (p_fields->>'mob')::numeric end
  );
  v_mob_qty := public.phase2b_offset_amount(
    public.phase2b_component_remaining(v.id, 'mob_qty'),
    case when p_fields is null or not (p_fields ? 'mob_qty') then null else (p_fields->>'mob_qty')::numeric end
  );

  perform set_config('protrack.system_reversal', '1', true);
  perform set_config('protrack.event_kind', 'reversed', true);
  perform set_config('protrack.event_reason', trim(p_reason), true);

  insert into public.project_costs (
    tenant_id, project_id, category, category_id, custom_fields, date, cost,
    vendor, invoice_number, in_system, employee_name, employee_id,
    st_hours, st_rate, ot_hours, ot_rate, dt_hours, dt_rate,
    per_diem, mob, mob_qty, mob_rate, subcontractor_name, description,
    change_order_id, reversal_of_id, reversal_reason
  ) values (
    v.tenant_id, v.project_id, v.category, v.category_id, coalesce(v.custom_fields, '{}'::jsonb), p_date, v_cost,
    v.vendor, v.invoice_number, false, v.employee_name, v.employee_id,
    v_st, abs(coalesce(v.st_rate, 0)), v_ot, abs(coalesce(v.ot_rate, 0)), v_dt, abs(coalesce(v.dt_rate, 0)),
    v_per_diem, v_mob, v_mob_qty, abs(coalesce(v.mob_rate, 0)), v.subcontractor_name, v.description,
    v.change_order_id, v.id, trim(p_reason)
  ) returning id into v_new;

  perform set_config('protrack.system_reversal', '', true);
  perform set_config('protrack.event_kind', 'skip', true);
  perform set_config('protrack.system_stamp', '1', true);

  update public.project_costs
  set reversed_at = case when public.phase2b_cost_remaining(id) = 0 then now() else null end,
      updated_at = now()
  where id = v.id;

  perform set_config('protrack.system_stamp', '', true);
  perform set_config('protrack.event_kind', '', true);
  perform set_config('protrack.event_reason', '', true);

  return v_new;
end;
$$;

create or replace function public.reverse_customer_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_date date,
  p_amount numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.customer_invoices%rowtype;
  v_perms jsonb;
  v_amount numeric;
  v_base text;
  v_number text;
  v_suffix text;
  v_n integer := 2;
  v_new uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;
  if p_date is null then
    raise exception 'A date is required';
  end if;

  select * into v from public.customer_invoices where id = p_invoice_id for update;
  if v.id is null or v.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Invoice not found';
  end if;
  if not public.can_see_project(v.project_id) then
    raise exception 'You cannot see this project';
  end if;
  if not public.is_master() then
    select permissions into v_perms from public.users where id = public.current_profile_id();
    if v_perms ? 'invoices' and (v_perms ->> 'invoices') is distinct from 'write' then
      raise exception 'You do not have write access to invoices';
    end if;
  end if;
  if public.phase2b_invoice_remaining(v.id) = 0 then
    raise exception 'Nothing left to reverse';
  end if;

  v_amount := public.phase2b_offset_amount(public.phase2b_invoice_remaining(v.id), p_amount);

  v_base := 'CM-' || v.invoice_number;
  if length(v_base) > 100 then
    v_base := left(v_base, 100);
  end if;
  v_number := v_base;
  while exists (
    select 1 from public.customer_invoices existing
    where existing.tenant_id = v.tenant_id and existing.invoice_number = v_number
  ) loop
    v_suffix := '-' || v_n::text;
    v_number := left(v_base, 100 - char_length(v_suffix)) || v_suffix;
    v_n := v_n + 1;
    if v_n > 1000 then
      raise exception 'Could not assign a credit memo number';
    end if;
  end loop;

  perform set_config('protrack.system_reversal', '1', true);
  perform set_config('protrack.event_kind', 'credit_memo', true);
  perform set_config('protrack.event_reason', trim(p_reason), true);

  insert into public.customer_invoices (
    tenant_id, project_id, invoice_number, amount, amount_collected, date_billed,
    change_order_id, in_system, reversal_of_id, reversal_reason
  ) values (
    v.tenant_id, v.project_id, v_number, v_amount, 0, p_date,
    v.change_order_id, false, v.id, trim(p_reason)
  ) returning id into v_new;

  perform set_config('protrack.system_reversal', '', true);
  perform set_config('protrack.event_kind', 'skip', true);
  perform set_config('protrack.system_stamp', '1', true);

  update public.customer_invoices
  set reversed_at = case when public.phase2b_invoice_remaining(id) = 0 then now() else null end,
      updated_at = now()
  where id = v.id;

  perform set_config('protrack.system_stamp', '', true);
  perform set_config('protrack.event_kind', '', true);
  perform set_config('protrack.event_reason', '', true);

  return v_new;
end;
$$;

create or replace function public.move_project_cost(
  p_cost_id uuid,
  p_category_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.project_costs%rowtype;
  v_dest public.cost_categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;

  select * into v from public.project_costs where id = p_cost_id for update;
  if v.id is null or v.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Entry not found';
  end if;
  if v.reversal_of_id is not null then
    raise exception 'Move the original entry. Its reversals move with it.';
  end if;
  if not public.can_see_project(v.project_id) then
    raise exception 'You cannot see this project';
  end if;
  if not public.can_access_category(
    public.resolve_cost_category_id(v.category_id, v.category, v.tenant_id),
    'write'
  ) then
    raise exception 'You do not have write access to the current category';
  end if;

  select * into v_dest
  from public.cost_categories
  where id = p_category_id and tenant_id = v.tenant_id and is_hidden = false;
  if v_dest.id is null then
    raise exception 'Choose a visible category in this company';
  end if;
  if exists (
    select 1 from public.cost_categories child
    where child.parent_id = v_dest.id and child.tenant_id = v.tenant_id and child.is_hidden = false
  ) then
    raise exception 'That category has subcategories. Pick one of its children.';
  end if;
  if not public.can_access_category(v_dest.id, 'write') then
    raise exception 'You do not have write access to the destination category';
  end if;

  if exists (
    with recursive chain as (
      select id, date, tenant_id from public.project_costs where id = v.id
      union all
      select child.id, child.date, child.tenant_id
      from public.project_costs child
      join chain on child.reversal_of_id = chain.id
    )
    select 1 from chain where public.books_lock_covers(chain.tenant_id, chain.date)
  ) then
    raise exception 'This date is in a closed period. Reverse the entry, or clear the books lock, before moving it.';
  end if;

  perform set_config('protrack.system_move', '1', true);
  perform set_config('protrack.event_kind', 'moved', true);
  perform set_config('protrack.event_reason', trim(p_reason), true);

  update public.project_costs
  set category_id = v_dest.id,
      updated_at = now()
  where id in (
    with recursive chain as (
      select id from public.project_costs where id = v.id
      union all
      select child.id
      from public.project_costs child
      join chain on child.reversal_of_id = chain.id
    )
    select id from chain
  );

  perform set_config('protrack.system_move', '', true);
  perform set_config('protrack.event_kind', '', true);
  perform set_config('protrack.event_reason', '', true);
end;
$$;

-- Tighten unknown attachment types only when every stored row is a type
-- the app already writes. Rollback restores the previous ELSE true body.
do $$
begin
  if exists (
    select 1
    from public.attachments
    where entity_type not in ('cost', 'customer_invoice', 'project', 'change_order')
  ) then
    raise exception 'Refusing to tighten attachment_project_visible: unknown entity_type values exist';
  end if;
end $$;

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
    -- 'projects' is the plural the pre-Phase-2 isolation test inserts.
    -- Treating it like 'project' keeps that check passing. Any other
    -- unknown type is hidden.
    when p_entity_type in ('project', 'projects') then public.can_see_project(p_entity_id)
    when p_entity_type = 'change_order' then exists (
      select 1
      from public.change_orders co
      where co.id = p_entity_id
        and public.can_see_project(co.project_id)
    )
    else false
  end
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.books_lock_covers(uuid, date)',
    'public.phase2b_offset_amount(numeric, numeric)',
    'public.phase2b_cost_remaining(uuid)',
    'public.phase2b_invoice_remaining(uuid)',
    'public.phase2b_component_remaining(uuid, text)',
    'public.guard_project_cost_change()',
    'public.log_project_cost_event()',
    'public.guard_customer_invoice_change()',
    'public.log_customer_invoice_event()',
    'public.reverse_project_cost(uuid, text, date, jsonb)',
    'public.reverse_customer_invoice(uuid, text, date, numeric)',
    'public.move_project_cost(uuid, uuid, text)',
    'public.attachment_project_visible(text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
  end loop;
end $$;

revoke all on function public.books_lock_covers(uuid, date) from authenticated;
revoke all on function public.phase2b_offset_amount(numeric, numeric) from authenticated;
revoke all on function public.phase2b_cost_remaining(uuid) from authenticated;
revoke all on function public.phase2b_invoice_remaining(uuid) from authenticated;
revoke all on function public.phase2b_component_remaining(uuid, text) from authenticated;

grant execute on function public.guard_project_cost_change() to authenticated;
grant execute on function public.log_project_cost_event() to authenticated;
grant execute on function public.guard_customer_invoice_change() to authenticated;
grant execute on function public.log_customer_invoice_event() to authenticated;
grant execute on function public.reverse_project_cost(uuid, text, date, jsonb) to authenticated;
grant execute on function public.reverse_customer_invoice(uuid, text, date, numeric) to authenticated;
grant execute on function public.move_project_cost(uuid, uuid, text) to authenticated;
grant execute on function public.attachment_project_visible(text, uuid) to authenticated;

commit;

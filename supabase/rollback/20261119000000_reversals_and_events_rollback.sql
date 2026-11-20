-- Rolls back Phase 2b reversals and record_events.
-- Drops the new objects and restores attachment_project_visible to the
-- Phase 2 body (unknown entity types visible). Does not delete or rewrite
-- project_costs.cost or customer_invoices.amount. Rows created as reversals
-- stay in place as ordinary negative rows once the link columns are gone.
-- Run this before the Phase 2 rollbacks.

begin;

drop trigger if exists project_costs_phase2b_log on public.project_costs;
drop trigger if exists project_costs_phase2b_guard on public.project_costs;
drop trigger if exists customer_invoices_phase2b_log on public.customer_invoices;
drop trigger if exists customer_invoices_phase2b_guard on public.customer_invoices;

drop function if exists public.move_project_cost(uuid, uuid, text);
drop function if exists public.reverse_customer_invoice(uuid, text, date, numeric);
drop function if exists public.reverse_project_cost(uuid, text, date, jsonb);
drop function if exists public.log_customer_invoice_event();
drop function if exists public.guard_customer_invoice_change();
drop function if exists public.log_project_cost_event();
drop function if exists public.guard_project_cost_change();
drop function if exists public.phase2b_component_remaining(uuid, text);
drop function if exists public.phase2b_invoice_remaining(uuid);
drop function if exists public.phase2b_cost_remaining(uuid);
drop function if exists public.phase2b_offset_amount(numeric, numeric);
drop function if exists public.books_lock_covers(uuid, date);

drop table if exists public.record_events;

alter table public.project_costs drop constraint if exists project_costs_reversal_of_id_fkey;
alter table public.customer_invoices drop constraint if exists customer_invoices_reversal_of_id_fkey;
alter table public.project_costs drop column if exists reversal_reason;
alter table public.project_costs drop column if exists reversed_at;
alter table public.project_costs drop column if exists reversal_of_id;
alter table public.customer_invoices drop column if exists reversal_reason;
alter table public.customer_invoices drop column if exists reversed_at;
alter table public.customer_invoices drop column if exists reversal_of_id;

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

revoke all on function public.attachment_project_visible(text, uuid) from public, anon;
grant execute on function public.attachment_project_visible(text, uuid) to authenticated;

commit;

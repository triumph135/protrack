-- Amount collected against a customer invoice. Existing invoices start at zero.
-- Additive. Does not change invoice amounts or row security.

alter table public.customer_invoices
  add column if not exists amount_collected numeric(15,2) not null default 0;

alter table public.customer_invoices
  drop constraint if exists customer_invoices_amount_collected_nonnegative;

alter table public.customer_invoices
  add constraint customer_invoices_amount_collected_nonnegative
  check (amount_collected >= 0);

alter table public.customer_invoices
  drop constraint if exists customer_invoices_amount_collected_nonnegative;

alter table public.customer_invoices
  drop column if exists amount_collected;

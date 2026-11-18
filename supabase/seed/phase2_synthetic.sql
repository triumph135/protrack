-- Synthetic data for local Phase 2 testing. No real people or companies.
-- Run after the Nov 13 snapshot and every migration in supabase/migrations.
-- Passwords for the auth rows below are ChangeMe!12345, same as the snapshot.
-- The RLS isolation test expects the snapshot's row counts, so run that
-- test before this file.

begin;

create extension if not exists pgcrypto;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111a4',
   'authenticated', 'authenticated', 'viewer-a@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Acme Viewer"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111d1',
   'authenticated', 'authenticated', 'solo@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Solo User"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111d2',
   'authenticated', 'authenticated', 'ghost@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Ghost Auth"}',
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into public.users (id, tenant_id, name, email, role, permissions, is_active, last_login)
values
  ('11111111-1111-4111-8111-1111111111a4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'Acme Viewer', 'viewer-a@example.test', 'view', '{}'::jsonb, true, now() - interval '2 days'),
  ('11111111-1111-4111-8111-1111111111d1', null,
   'Solo User', 'solo@example.test', 'entry', '{}'::jsonb, true, null)
on conflict (id) do nothing;

-- ghost@example.test is an auth user with no public.users row.

update public.users
set last_login = now() - interval '1 hour'
where id = '11111111-1111-4111-8111-1111111111a1';

insert into public.projects (
  id, tenant_id, "jobNumber", "jobName", customer, "fieldShopBoth", "totalContractValue", status
) values (
  '22222222-2222-4222-8222-2222222222a2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'JOB-A-002', 'Acme Shop Job', 'Acme Customer', 'Shop', 42000, 'Active'
) on conflict (id) do nothing;

insert into public.project_assignments (project_id, user_id, tenant_id)
values
  ('22222222-2222-4222-8222-2222222222a1', '11111111-1111-4111-8111-1111111111a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('22222222-2222-4222-8222-2222222222a1', '11111111-1111-4111-8111-1111111111a4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
on conflict do nothing;

update public.project_budgets
set
  material_budget = 10000,
  labor_budget = 20000,
  equipment_budget = 5000,
  subcontractor_budget = 8000,
  others_budget = 1500,
  cap_leases_budget = 700,
  consumable_budget = 300,
  updated_by = '11111111-1111-4111-8111-1111111111a1'
where project_id = '22222222-2222-4222-8222-2222222222a1';

insert into public.employees (
  id, tenant_id, name, standard_rate, ot_rate, dt_rate, project_id, mob, mob_rate
) values
  ('44444444-4444-4444-8444-4444444444a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'Alex Rivera', 45, 67.50, 90, null, 25, 25),
  ('44444444-4444-4444-8444-4444444444a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'Jordan Lee', 40, 60, 80, '22222222-2222-4222-8222-2222222222a1', 0, 0),
  ('44444444-4444-4444-8444-4444444444a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'Sam Patel', 38, 57, 76, '22222222-2222-4222-8222-2222222222a2', 0, 0)
on conflict (id) do nothing;

insert into public.change_orders (
  id, project_id, tenant_id, name, description, additional_contract_value
) values (
  '33333333-3333-4333-8333-3333333333a1',
  '22222222-2222-4222-8222-2222222222a1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Added welding',
  'Synthetic change order',
  12000
) on conflict (id) do nothing;

-- One cost in every built-in category. Labor uses ST/OT/DT.
insert into public.project_costs (
  id, tenant_id, project_id, category, date, cost, vendor, invoice_number, description,
  employee_name, employee_id, st_hours, st_rate, ot_hours, ot_rate, dt_hours, dt_rate,
  per_diem, mob_qty, mob_rate, subcontractor_name, in_system
) values
  ('55555555-5555-4555-8555-5555555555a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '22222222-2222-4222-8222-2222222222a1', 'labor', '2026-02-02', 650.00, null, null,
   'Monday crew', 'Alex Rivera', '44444444-4444-4444-8444-4444444444a1',
   8, 45, 2, 67.50, 1, 90, 40, 1, 25, null, false),
  ('55555555-5555-4555-8555-5555555555a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '22222222-2222-4222-8222-2222222222a1', 'equipment', '2026-02-03', 480.00,
   'Lift Co', 'EQ-100', 'Scissor lift', null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Lift Co', true),
  ('55555555-5555-4555-8555-5555555555a4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '22222222-2222-4222-8222-2222222222a1', 'subcontractor', '2026-02-04', 2200.00,
   'North Welding', 'SUB-9', 'Field welds', null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'North Welding', false),
  ('55555555-5555-4555-8555-5555555555a5', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '22222222-2222-4222-8222-2222222222a1', 'others', '2026-02-05', 90.00,
   'Permit Desk', 'OT-3', 'City permit', null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, true),
  ('55555555-5555-4555-8555-5555555555a6', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '22222222-2222-4222-8222-2222222222a1', 'cap_leases', '2026-02-06', 1100.00,
   'Lease Co', 'CL-1', 'Generator lease', null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, false),
  ('55555555-5555-4555-8555-5555555555a7', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '22222222-2222-4222-8222-2222222222a1', 'consumable', '2026-02-07', 64.50,
   'Shop Supply', 'CS-4', 'Grinding discs', null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, true)
on conflict (id) do nothing;

insert into public.customer_invoices (
  id, tenant_id, project_id, invoice_number, amount, amount_collected, date_billed, in_system
) values (
  '66666666-6666-4666-8666-6666666666a2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-2222-4222-8222-2222222222a1',
  'INV-A-002', 1800.00, 900.00, '2026-02-15', true
) on conflict (id) do nothing;

insert into public.attachments (
  id, tenant_id, entity_type, entity_id, file_name, file_size, file_type, storage_path, uploaded_by, description
) values
  ('77777777-7777-4777-8777-7777777777a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'cost', '55555555-5555-4555-8555-5555555555a3', 'lift-invoice.pdf', 12000, 'application/pdf',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/cost/55555555-5555-4555-8555-5555555555a3/1700000000_lift-invoice.pdf',
   '11111111-1111-4111-8111-1111111111a1', 'Equipment invoice'),
  ('77777777-7777-4777-8777-7777777777a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'customer_invoice', '66666666-6666-4666-8666-6666666666a2', 'inv-a-002.pdf', 8000, 'application/pdf',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/customer_invoice/66666666-6666-4666-8666-6666666666a2/1700000001_inv-a-002.pdf',
   '11111111-1111-4111-8111-1111111111a1', 'Customer invoice')
on conflict (id) do nothing;

-- Project manager: edit on categories, invoices, and projects. No team access.
-- Viewer: view on everything except team, export off.
do $$
declare
  v_pm jsonb := jsonb_build_object(
    'material', 'write',
    'labor', 'write',
    'equipment', 'write',
    'subcontractor', 'write',
    'others', 'write',
    'capLeases', 'write',
    'consumable', 'write',
    'invoices', 'write',
    'projects', 'write',
    'users', 'none',
    'employees', 'write'
  );
  v_view jsonb := jsonb_build_object(
    'material', 'read',
    'labor', 'read',
    'equipment', 'read',
    'subcontractor', 'read',
    'others', 'read',
    'capLeases', 'read',
    'consumable', 'read',
    'invoices', 'read',
    'projects', 'read',
    'users', 'none',
    'employees', 'read'
  );
  v_cats jsonb;
  v_export_on jsonb;
  v_export_off jsonb;
begin
  select coalesce(jsonb_object_agg(id::text, 'write'), '{}'::jsonb)
  into v_cats
  from public.cost_categories
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

  select coalesce(jsonb_object_agg(id::text, to_jsonb(true)), '{}'::jsonb)
  into v_export_on
  from public.cost_categories
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_export_on := v_export_on || jsonb_build_object('invoices', true, 'projects', true, 'employees', true, 'users', false);

  select coalesce(jsonb_object_agg(id::text, to_jsonb(false)), '{}'::jsonb)
  into v_export_off
  from public.cost_categories
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_export_off := v_export_off || jsonb_build_object('invoices', false, 'projects', false, 'employees', false, 'users', false);

  update public.users
  set permissions = v_pm || jsonb_build_object('version', 2, 'categories', v_cats, 'export', v_export_on)
  where id = '11111111-1111-4111-8111-1111111111a2';

  select coalesce(jsonb_object_agg(id::text, 'read'), '{}'::jsonb)
  into v_cats
  from public.cost_categories
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

  update public.users
  set permissions = v_view || jsonb_build_object('version', 2, 'categories', v_cats, 'export', v_export_off)
  where id = '11111111-1111-4111-8111-1111111111a4';
end $$;

select public.backfill_category_permissions();

commit;

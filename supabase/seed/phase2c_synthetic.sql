-- Synthetic Reporting Center data. Load after phase2_synthetic.sql and after
-- the Phase 2 / 2b checks. It does not change JOB-A-001 or JOB-B-001 totals.
-- New activity lives on JOB-A-003. Passwords stay ChangeMe!12345.

begin;

insert into public.projects (
  id, tenant_id, "jobNumber", "jobName", customer, "fieldShopBoth", "totalContractValue", status
) values (
  '22222222-2222-4222-8222-2222222222a3',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'JOB-A-003', 'Acme 2025 Shop', 'Acme Customer', 'Shop', 18000, 'Active'
) on conflict (id) do nothing;

insert into public.users (id, tenant_id, name, email, role, permissions, is_active)
values (
  '11111111-1111-4111-8111-1111111111a5',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Limited PM',
  'limited-a@example.test',
  'entry',
  jsonb_build_object(
    'version', 2,
    'material', 'write',
    'labor', 'none',
    'equipment', 'read',
    'subcontractor', 'read',
    'others', 'read',
    'capLeases', 'read',
    'consumable', 'read',
    'invoices', 'none',
    'projects', 'write',
    'users', 'none',
    'employees', 'none'
  ),
  true
) on conflict (id) do nothing;

insert into public.project_assignments (project_id, user_id, tenant_id)
values (
  '22222222-2222-4222-8222-2222222222a3',
  '11111111-1111-4111-8111-1111111111a5',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
) on conflict do nothing;

update public.employees
set job_role = case id
  when '44444444-4444-4444-8444-4444444444a1' then 'Welder'
  when '44444444-4444-4444-8444-4444444444a2' then 'Helper'
  when '44444444-4444-4444-8444-4444444444a3' then 'Welder'
  else job_role
end
where id in (
  '44444444-4444-4444-8444-4444444444a1',
  '44444444-4444-4444-8444-4444444444a2',
  '44444444-4444-4444-8444-4444444444a3'
);

insert into public.employee_project_rates (
  employee_id, project_id, tenant_id, effective_date, standard_rate, ot_rate, dt_rate, mob_rate
) values (
  '44444444-4444-4444-8444-4444444444a1',
  '22222222-2222-4222-8222-2222222222a3',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '2026-01-01', 55, 82.50, 110, 25
) on conflict (employee_id, project_id, effective_date) do nothing;

insert into public.cost_categories (id, tenant_id, name, parent_id, kind, is_builtin, sort_order)
select
  '99999999-9999-4999-8999-9999999999c1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Lumber',
  parent.id,
  'standard',
  false,
  15
from public.cost_categories parent
where parent.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and parent.builtin_key = 'material'
on conflict (id) do nothing;

insert into public.project_costs (
  id, tenant_id, project_id, category_id, category, date, cost, vendor, invoice_number, description
)
select
  ids.id,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-2222-4222-8222-2222222222a3',
  case when ids.category = 'material' then parent.id else lumber.id end,
  ids.category,
  ids.dated,
  ids.amount,
  ids.vendor,
  ids.invoice_number,
  ids.description
from (values
  ('88888888-8888-4888-8888-8888888888c1'::uuid, 'material', date '2026-03-02', 40.00, 'Home Depot', 'HD-1', 'Plywood'),
  ('88888888-8888-4888-8888-8888888888c2'::uuid, 'material', date '2025-11-02', 15.00, 'HOME  DEPOT', 'HD-2', 'Screws'),
  ('88888888-8888-4888-8888-8888888888c3'::uuid, 'lumber', date '2026-04-04', 100.00, 'home depot', 'HD-3', 'Studs'),
  ('88888888-8888-4888-8888-8888888888c4'::uuid, 'lumber', date '2026-05-05', 20.00, 'Home Depot', 'HD-4', 'Wrong ticket')
) as ids(id, category, dated, amount, vendor, invoice_number, description)
join public.cost_categories parent
  on parent.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and parent.builtin_key = 'material'
join public.cost_categories lumber
  on lumber.id = '99999999-9999-4999-8999-9999999999c1'
on conflict (id) do nothing;

insert into public.project_costs (
  id, tenant_id, project_id, category_id, category, date, cost, description,
  employee_name, employee_id, st_hours, st_rate, ot_hours, ot_rate, dt_hours, dt_rate
)
select
  '88888888-8888-4888-8888-8888888888c5',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-2222-4222-8222-2222222222a3',
  labor.id,
  'labor',
  '2026-06-01',
  440.00,
  'Shop labor',
  'Alex Rivera',
  '44444444-4444-4444-8444-4444444444a1',
  8, 55, 0, 0, 0, 0
from public.cost_categories labor
where labor.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and labor.builtin_key = 'labor'
on conflict (id) do nothing;

insert into public.change_orders (id, project_id, tenant_id, name, description, additional_contract_value)
values
  ('33333333-3333-4333-8333-3333333333c1', '22222222-2222-4222-8222-2222222222a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Extra wall', '2025 change', 2500),
  ('33333333-3333-4333-8333-3333333333c2', '22222222-2222-4222-8222-2222222222a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Paint', '2026 change', 800)
on conflict (id) do nothing;

insert into public.customer_invoices (
  id, tenant_id, project_id, invoice_number, amount, amount_collected, date_billed, in_system
) values (
  '66666666-6666-4666-8666-6666666666c1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-2222-4222-8222-2222222222a3',
  'INV-A-003', 900.00, 100.00, '2026-06-15', true
) on conflict (id) do nothing;

do $$
declare
  v_others uuid;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-1111111111a1","role":"authenticated","email":"master-a@example.test"}',
    true
  );
  execute 'set local role authenticated';

  perform public.reverse_project_cost('88888888-8888-4888-8888-8888888888c3', 'Returned lumber', '2026-04-20', '{"cost":40}'::jsonb);
  perform public.reverse_project_cost('88888888-8888-4888-8888-8888888888c4', 'Wrong ticket', '2026-05-06', null);
  perform public.reverse_customer_invoice('66666666-6666-4666-8666-6666666666c1', 'Billing error', '2026-06-20', 150);

  select id into v_others
  from public.cost_categories
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and builtin_key = 'others';
  perform public.move_project_cost('88888888-8888-4888-8888-8888888888c1', v_others, 'Moved to others');
end $$;

reset role;

insert into public.attachments (
  id, tenant_id, entity_type, entity_id, file_name, file_size, file_type, storage_path, uploaded_by, description
) values (
  '77777777-7777-4777-8777-7777777777c1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'cost',
  '88888888-8888-4888-8888-8888888888c2',
  'screws.pdf',
  4000,
  'application/pdf',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/cost/88888888-8888-4888-8888-8888888888c2/1700000002_screws.pdf',
  '11111111-1111-4111-8111-1111111111a1',
  'Vendor ticket'
) on conflict (id) do nothing;

commit;

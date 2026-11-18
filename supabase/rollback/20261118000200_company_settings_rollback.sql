-- Rolls back 20261118000200_company_settings.sql.
-- Puts row policies back to the shape left by 20261118000000_cost_categories.sql:
-- tenant match, category checks on project_costs, no project-visibility filter.
-- settings.labor_split_enabled and settings.project_visibility are left in
-- place. The app on main ignores unknown settings keys, and the default
-- reader treats a missing project_visibility as 'all'.
-- Direct and indirect labor categories, if they were created, stay. Hiding
-- them is data, and the category rollback drops the whole table.

begin;

drop trigger if exists tenants_seed_labor_fields on public.tenants;

drop policy if exists projects_select on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy projects_update on public.projects
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy projects_delete on public.projects
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists project_costs_select on public.project_costs;
drop policy if exists project_costs_insert on public.project_costs;
drop policy if exists project_costs_update on public.project_costs;
drop policy if exists project_costs_delete on public.project_costs;
create policy project_costs_select on public.project_costs
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'read'
    )
  );
create policy project_costs_insert on public.project_costs
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );
create policy project_costs_update on public.project_costs
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );
create policy project_costs_delete on public.project_costs
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_access_category(
      public.resolve_cost_category_id(category_id, category, tenant_id),
      'write'
    )
  );

drop policy if exists customer_invoices_select on public.customer_invoices;
drop policy if exists customer_invoices_insert on public.customer_invoices;
drop policy if exists customer_invoices_update on public.customer_invoices;
drop policy if exists customer_invoices_delete on public.customer_invoices;
create policy customer_invoices_select on public.customer_invoices
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy customer_invoices_insert on public.customer_invoices
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy customer_invoices_update on public.customer_invoices
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy customer_invoices_delete on public.customer_invoices
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists change_orders_select on public.change_orders;
drop policy if exists change_orders_insert on public.change_orders;
drop policy if exists change_orders_update on public.change_orders;
drop policy if exists change_orders_delete on public.change_orders;
create policy change_orders_select on public.change_orders
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy change_orders_insert on public.change_orders
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy change_orders_update on public.change_orders
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy change_orders_delete on public.change_orders
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists project_budgets_select on public.project_budgets;
drop policy if exists project_budgets_insert on public.project_budgets;
drop policy if exists project_budgets_update on public.project_budgets;
drop policy if exists project_budgets_delete on public.project_budgets;
create policy project_budgets_select on public.project_budgets
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy project_budgets_insert on public.project_budgets
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy project_budgets_update on public.project_budgets
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy project_budgets_delete on public.project_budgets
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists project_category_budgets_select on public.project_category_budgets;
drop policy if exists project_category_budgets_insert on public.project_category_budgets;
drop policy if exists project_category_budgets_update on public.project_category_budgets;
drop policy if exists project_category_budgets_delete on public.project_category_budgets;
create policy project_category_budgets_select on public.project_category_budgets
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy project_category_budgets_insert on public.project_category_budgets
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy project_category_budgets_update on public.project_category_budgets
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy project_category_budgets_delete on public.project_category_budgets
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists change_order_budgets_select on public.change_order_budgets;
drop policy if exists change_order_budgets_insert on public.change_order_budgets;
drop policy if exists change_order_budgets_update on public.change_order_budgets;
drop policy if exists change_order_budgets_delete on public.change_order_budgets;
create policy change_order_budgets_select on public.change_order_budgets
  for select to authenticated
  using (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ));
create policy change_order_budgets_insert on public.change_order_budgets
  for insert to authenticated
  with check (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ));
create policy change_order_budgets_update on public.change_order_budgets
  for update to authenticated
  using (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ))
  with check (change_order_id in (
    select c.id from public.change_orders c
    where c.tenant_id = public.current_tenant_id()
  ));
create policy change_order_budgets_delete on public.change_order_budgets
  for delete to authenticated
  using (
    public.is_master()
    and change_order_id in (
      select c.id from public.change_orders c
      where c.tenant_id = public.current_tenant_id()
    )
  );

drop policy if exists employees_select on public.employees;
drop policy if exists employees_insert on public.employees;
drop policy if exists employees_update on public.employees;
drop policy if exists employees_delete on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy employees_insert on public.employees
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy employees_update on public.employees
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy employees_delete on public.employees
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_master());

drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
drop policy if exists attachments_delete on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy attachments_update on public.attachments
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (uploaded_by = (select auth.uid()) or public.is_master())
  );

drop table if exists public.project_assignments;
drop table if exists public.labor_field_definitions;

drop function if exists public.attachment_project_visible(text, uuid);
drop function if exists public.apply_invite_project_assignments(text);
drop function if exists public.set_labor_split(boolean);
drop function if exists public.can_see_project(uuid);
drop function if exists public.project_row_visible(uuid, uuid);
drop function if exists public.seed_labor_fields_for_new_tenant();
drop function if exists public.seed_labor_field_presets(uuid);
drop function if exists public.enforce_labor_field_rules();

commit;

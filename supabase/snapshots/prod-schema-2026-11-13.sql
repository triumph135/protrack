-- ProTrack-Prod (cqocddiracijeccswqzz) schema-only snapshot
-- Captured 2026-11-13 from the live project via the Supabase MCP (read-only).
-- Intended for `supabase start` + psql, so the RLS migrations can be tested
-- against a faithful copy of production structure -- not production data.
--
-- Contains no real user rows, emails, or secrets.
-- A small SYNTHETIC seed is at the bottom.
--
-- See protrack-prod-schema-notes.md for limitations, counts, and advisors.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Functions (needed by policies and triggers). None have search_path set
-- in production (advisor: function_search_path_mutable).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1;
 $function$;

CREATE OR REPLACE FUNCTION public.is_current_user_master()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'master'
    AND is_active = true
    AND tenant_id IS NOT NULL
  );
 $function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
 $function$;

CREATE OR REPLACE FUNCTION public.get_tenant_id_from_project(project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT tenant_id
    FROM projects
    WHERE id = project_id
    LIMIT 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_can_access_tenant(target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Allow if user belongs to the target tenant
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND tenant_id = target_tenant_id
    AND is_active = true
  );
END;
$function$;

-- Production calls auth.send_invitation_email(p_email), which is not a
-- public/documented Auth API and may be missing on local supabase start.
-- The body is preserved; wrap in a no-op stub if the local Auth schema
-- does not provide that function. See notes.
CREATE OR REPLACE FUNCTION public.send_user_invitation(p_email text, p_invitation_token uuid, p_tenant_name text, p_invited_by_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- This function can be enhanced to send custom emails
  -- For now, we'll use the built-in Supabase auth invitation
  PERFORM auth.send_invitation_email(p_email);
END;
 $function$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subdomain character varying(50) NOT NULL,
  name character varying(255) NOT NULL,
  email character varying(255) NOT NULL,
  phone character varying(20),
  status character varying(20) DEFAULT 'active'::character varying,
  plan character varying(20) DEFAULT 'professional'::character varying,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  subscription_ends_at timestamp with time zone,
  billing_info jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name character varying(255) NOT NULL,
  email character varying(255) NOT NULL,
  role character varying(50) NOT NULL DEFAULT 'entry'::character varying,
  permissions jsonb DEFAULT '{}'::jsonb,
  password_hash character varying(255),
  is_active boolean DEFAULT true,
  last_login timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  force_password_change boolean DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  "jobNumber" character varying(100) NOT NULL,
  "jobName" character varying(255) NOT NULL,
  customer character varying(255) NOT NULL,
  "fieldShopBoth" character varying(20) DEFAULT 'Both'::character varying,
  "totalContractValue" numeric(15,2) DEFAULT 0,
  status character varying(20) DEFAULT 'Active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name character varying(255) NOT NULL,
  standard_rate numeric(10,2) NOT NULL,
  ot_rate numeric(10,2) NOT NULL,
  dt_rate numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  project_id uuid,
  mob numeric(10,2),
  mob_rate numeric(10,2),
  CONSTRAINT employees_pkey PRIMARY KEY (id)
);

CREATE TABLE public.change_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  additional_contract_value numeric(15,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT change_orders_pkey PRIMARY KEY (id)
);

CREATE TABLE public.change_order_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL,
  category character varying(50) NOT NULL,
  budget numeric(15,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT change_order_budgets_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  category character varying(50) NOT NULL,
  "date" date NOT NULL,
  cost numeric(15,2) DEFAULT 0,
  vendor character varying(255),
  invoice_number character varying(100),
  in_system boolean DEFAULT false,
  employee_name character varying(255),
  st_hours numeric(8,2) DEFAULT 0,
  st_rate numeric(8,2) DEFAULT 0,
  ot_hours numeric(8,2) DEFAULT 0,
  ot_rate numeric(8,2) DEFAULT 0,
  dt_hours numeric(8,2) DEFAULT 0,
  dt_rate numeric(8,2) DEFAULT 0,
  per_diem numeric(8,2) DEFAULT 0,
  subcontractor_name character varying(255),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  description text,
  change_order_id uuid,
  employee_id uuid,
  mob numeric(10,2),
  mob_qty numeric(10,2),
  mob_rate numeric(10,2),
  CONSTRAINT project_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  material_budget numeric(15,2) DEFAULT 0,
  labor_budget numeric(15,2) DEFAULT 0,
  equipment_budget numeric(15,2) DEFAULT 0,
  subcontractor_budget numeric(15,2) DEFAULT 0,
  others_budget numeric(15,2) DEFAULT 0,
  cap_leases_budget numeric(15,2) DEFAULT 0,
  consumable_budget numeric(15,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  CONSTRAINT project_budgets_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  invoice_number character varying(100) NOT NULL,
  amount numeric(15,2) NOT NULL,
  date_billed date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  change_order_id uuid,
  in_system boolean DEFAULT false,
  CONSTRAINT customer_invoices_pkey PRIMARY KEY (id)
);

CREATE TABLE public.attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entity_type character varying(50) NOT NULL,
  entity_id uuid NOT NULL,
  file_name character varying(255) NOT NULL,
  file_size integer NOT NULL,
  file_type character varying(100) NOT NULL,
  storage_path character varying(500) NOT NULL,
  uploaded_by uuid,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT attachments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  action character varying(100) NOT NULL,
  resource character varying(100),
  resource_id uuid,
  ip_address inet,
  user_agent text,
  success boolean DEFAULT true,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.labor_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  employee_name character varying(255) NOT NULL,
  "date" date NOT NULL,
  st_hours numeric(5,2) DEFAULT 0,
  st_rate numeric(8,2) DEFAULT 0,
  ot_hours numeric(5,2) DEFAULT 0,
  ot_rate numeric(8,2) DEFAULT 0,
  dt_hours numeric(5,2) DEFAULT 0,
  dt_rate numeric(8,2) DEFAULT 0,
  per_diem numeric(8,2) DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  employee_id uuid,
  CONSTRAINT labor_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.material_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  "date" date NOT NULL,
  vendor character varying(255) NOT NULL,
  invoice_number character varying(100) NOT NULL,
  cost numeric(15,2) NOT NULL,
  in_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT material_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.equipment_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  subcontractor_name character varying(255),
  "date" date NOT NULL,
  vendor character varying(255) NOT NULL,
  invoice_number character varying(100) NOT NULL,
  cost numeric(15,2) NOT NULL,
  in_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.other_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  "date" date NOT NULL,
  vendor character varying(255) NOT NULL,
  invoice_number character varying(100) NOT NULL,
  cost numeric(15,2) NOT NULL,
  in_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT other_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.cap_lease_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  "date" date NOT NULL,
  vendor character varying(255) NOT NULL,
  invoice_number character varying(100) NOT NULL,
  cost numeric(15,2) NOT NULL,
  in_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cap_lease_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.consumable_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  "date" date NOT NULL,
  vendor character varying(255) NOT NULL,
  invoice_number character varying(100) NOT NULL,
  cost numeric(15,2) NOT NULL,
  in_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT consumable_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.subcontractor_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  subcontractor_name character varying(255) NOT NULL,
  "date" date NOT NULL,
  vendor character varying(255) NOT NULL,
  invoice_number character varying(100) NOT NULL,
  cost numeric(15,2) NOT NULL,
  in_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subcontractor_costs_pkey PRIMARY KEY (id)
);

-- Foreign keys
ALTER TABLE public.attachments ADD CONSTRAINT attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.change_order_budgets ADD CONSTRAINT change_order_budgets_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES change_orders(id) ON DELETE CASCADE;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customer_invoices ADD CONSTRAINT customer_invoices_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES change_orders(id) ON DELETE SET NULL;
ALTER TABLE public.customer_invoices ADD CONSTRAINT fk_invoices_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.customer_invoices ADD CONSTRAINT fk_invoices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD CONSTRAINT employees_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE public.employees ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.labor_costs ADD CONSTRAINT labor_costs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE public.project_budgets ADD CONSTRAINT project_budgets_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_budgets ADD CONSTRAINT project_budgets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.project_budgets ADD CONSTRAINT project_budgets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.project_costs ADD CONSTRAINT fk_costs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_costs ADD CONSTRAINT fk_costs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.project_costs ADD CONSTRAINT project_costs_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES change_orders(id) ON DELETE SET NULL;
ALTER TABLE public.project_costs ADD CONSTRAINT project_costs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE public.projects ADD CONSTRAINT fk_projects_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Indexes (including unique indexes that are not PK constraints).
-- PK unique indexes are created by PRIMARY KEY above; skip *_pkey here.
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX attachments_pkey ON public.attachments USING btree (id)
CREATE INDEX idx_attachments_entity ON public.attachments USING btree (entity_id, entity_type);
CREATE INDEX idx_attachments_tenant_id ON public.attachments USING btree (tenant_id);
CREATE INDEX idx_attachments_uploaded_by ON public.attachments USING btree (uploaded_by);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id)
CREATE INDEX idx_audit_logs_tenant_id ON public.audit_logs USING btree (tenant_id);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX cap_lease_costs_pkey ON public.cap_lease_costs USING btree (id)
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX change_order_budgets_pkey ON public.change_order_budgets USING btree (id)
CREATE INDEX idx_change_order_budgets_change_order_id ON public.change_order_budgets USING btree (change_order_id);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX change_orders_pkey ON public.change_orders USING btree (id)
CREATE INDEX idx_change_orders_project_id ON public.change_orders USING btree (project_id);
CREATE INDEX idx_change_orders_tenant_id ON public.change_orders USING btree (tenant_id);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX consumable_costs_pkey ON public.consumable_costs USING btree (id)
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX customer_invoices_pkey ON public.customer_invoices USING btree (id)
CREATE INDEX idx_invoices_tenant_id ON public.customer_invoices USING btree (tenant_id);
CREATE UNIQUE INDEX unique_invoice_number_per_tenant ON public.customer_invoices USING btree (invoice_number, tenant_id);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX employees_pkey ON public.employees USING btree (id)
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX equipment_costs_pkey ON public.equipment_costs USING btree (id)
CREATE INDEX idx_labor_costs_employee_id ON public.labor_costs USING btree (employee_id);
CREATE INDEX idx_labor_costs_project_date ON public.labor_costs USING btree (project_id, date);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX labor_costs_pkey ON public.labor_costs USING btree (id)
CREATE INDEX idx_material_costs_project_date ON public.material_costs USING btree (project_id, date);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX material_costs_pkey ON public.material_costs USING btree (id)
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX other_costs_pkey ON public.other_costs USING btree (id)
CREATE INDEX idx_budgets_project_id ON public.project_budgets USING btree (project_id);
CREATE INDEX idx_budgets_tenant_id ON public.project_budgets USING btree (tenant_id);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX project_budgets_pkey ON public.project_budgets USING btree (id)
CREATE UNIQUE INDEX unique_budget_per_project ON public.project_budgets USING btree (project_id, tenant_id);
CREATE INDEX idx_costs_category ON public.project_costs USING btree (category);
CREATE INDEX idx_costs_description ON public.project_costs USING btree (description);
CREATE INDEX idx_costs_project_id ON public.project_costs USING btree (project_id);
CREATE INDEX idx_costs_tenant_id ON public.project_costs USING btree (tenant_id);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX project_costs_pkey ON public.project_costs USING btree (id)
CREATE INDEX idx_projects_status ON public.projects USING btree (status);
CREATE INDEX idx_projects_tenant_id ON public.projects USING btree (tenant_id);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id)
CREATE UNIQUE INDEX unique_job_number_per_tenant ON public.projects USING btree (tenant_id, "jobNumber");
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX subcontractor_costs_pkey ON public.subcontractor_costs USING btree (id)
CREATE INDEX idx_tenants_subdomain ON public.tenants USING btree (subdomain);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX tenants_pkey ON public.tenants USING btree (id)
CREATE UNIQUE INDEX tenants_subdomain_key ON public.tenants USING btree (subdomain);
CREATE INDEX idx_users_force_password_change ON public.users USING btree (force_password_change) WHERE (force_password_change = true);
CREATE INDEX idx_users_tenant_id ON public.users USING btree (tenant_id);
CREATE UNIQUE INDEX unique_user_email_per_tenant ON public.users USING btree (tenant_id, email);
-- already created as PRIMARY KEY: CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)

-- Triggers
CREATE TRIGGER update_attachments_updated_at BEFORE UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON public.project_budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_costs_updated_at BEFORE UPDATE ON public.project_costs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row level security flags (production): enabled on every public table
-- except users and tenants, which have policies but RLS is OFF.
-- ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY; -- NOT enabled in production
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY; -- NOT enabled in production
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cap_lease_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumable_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_costs ENABLE ROW LEVEL SECURITY;

-- Policies (all PERMISSIVE, role = PUBLIC, matching production).
-- These exist on users/tenants even though RLS is disabled there.
CREATE POLICY "Master users can update their tenant" ON public.tenants
  FOR UPDATE TO public
  USING (((id = get_current_user_tenant_id()) AND is_current_user_master()));

CREATE POLICY "Users can view their own tenant" ON public.tenants
  FOR SELECT TO public
  USING ((id = get_current_user_tenant_id()));

CREATE POLICY "Master users can create users in their tenant" ON public.users
  FOR INSERT TO public
  WITH CHECK ((((tenant_id = get_current_user_tenant_id()) AND is_current_user_master()) OR (tenant_id IS NULL)));

CREATE POLICY "Master users can delete users in their tenant" ON public.users
  FOR DELETE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND is_current_user_master()));

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE TO public
  USING ((auth.uid() = id));

CREATE POLICY "Users can update profiles appropriately" ON public.users
  FOR UPDATE TO public
  USING (((id = auth.uid()) OR ((tenant_id = get_current_user_tenant_id()) AND is_current_user_master())));

CREATE POLICY "Users can update themselves" ON public.users
  FOR UPDATE TO public
  USING ((id = auth.uid()));

CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT TO public
  USING ((auth.uid() = id));

CREATE POLICY "Users can view their own record and tenant users" ON public.users
  FOR SELECT TO public
  USING (((id = auth.uid()) OR ((tenant_id IS NOT NULL) AND (tenant_id = ( SELECT users_1.tenant_id FROM users users_1 WHERE (users_1.id = auth.uid()) LIMIT 1)))));

CREATE POLICY "Users can view users in their tenant" ON public.users
  FOR SELECT TO public
  USING (((tenant_id = get_current_user_tenant_id()) OR (id = auth.uid()) OR (tenant_id IS NULL)));

CREATE POLICY "Users can create attachments in their tenant" ON public.attachments
  FOR INSERT TO public
  WITH CHECK ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can delete their own attachments, masters can delete any" ON public.attachments
  FOR DELETE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND ((uploaded_by = auth.uid()) OR is_current_user_master())));

CREATE POLICY "Users can update attachments in their tenant" ON public.attachments
  FOR UPDATE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND ((uploaded_by = auth.uid()) OR is_current_user_master())));

CREATE POLICY "Users can view attachments in their tenant" ON public.attachments
  FOR SELECT TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "No deletes on audit logs" ON public.audit_logs
  FOR DELETE TO public
  USING (false);

CREATE POLICY "No updates on audit logs" ON public.audit_logs
  FOR UPDATE TO public
  USING (false);

CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Users can view audit logs in their tenant" ON public.audit_logs
  FOR SELECT TO public
  USING (((tenant_id = get_current_user_tenant_id()) OR (tenant_id IS NULL)));

CREATE POLICY "Master users can delete customer invoices in their tenant" ON public.customer_invoices
  FOR DELETE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND is_current_user_master()));

CREATE POLICY "Users can create customer invoices in their tenant" ON public.customer_invoices
  FOR INSERT TO public
  WITH CHECK (((tenant_id = get_current_user_tenant_id()) AND (get_tenant_id_from_project(project_id) = tenant_id)));

CREATE POLICY "Users can update customer invoices in their tenant" ON public.customer_invoices
  FOR UPDATE TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can view customer invoices in their tenant" ON public.customer_invoices
  FOR SELECT TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Master users can delete employees in their tenant" ON public.employees
  FOR DELETE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND is_current_user_master()));

CREATE POLICY "Users can create employees in their tenant" ON public.employees
  FOR INSERT TO public
  WITH CHECK ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can update employees in their tenant" ON public.employees
  FOR UPDATE TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can view employees in their tenant" ON public.employees
  FOR SELECT TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Master users can delete projects in their tenant" ON public.projects
  FOR DELETE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND is_current_user_master()));

CREATE POLICY "Users can create projects in their tenant" ON public.projects
  FOR INSERT TO public
  WITH CHECK ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can update projects in their tenant" ON public.projects
  FOR UPDATE TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can view projects in their tenant" ON public.projects
  FOR SELECT TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Master users can delete change order budgets through their tena" ON public.change_order_budgets
  FOR DELETE TO public
  USING (((change_order_id IN ( SELECT change_orders.id FROM change_orders WHERE (change_orders.tenant_id = get_current_user_tenant_id()))) AND is_current_user_master()));

CREATE POLICY "Users can create change order budgets through their tenant" ON public.change_order_budgets
  FOR INSERT TO public
  WITH CHECK ((change_order_id IN ( SELECT change_orders.id FROM change_orders WHERE (change_orders.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update change order budgets through their tenant" ON public.change_order_budgets
  FOR UPDATE TO public
  USING ((change_order_id IN ( SELECT change_orders.id FROM change_orders WHERE (change_orders.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view change order budgets through their tenant" ON public.change_order_budgets
  FOR SELECT TO public
  USING ((change_order_id IN ( SELECT change_orders.id FROM change_orders WHERE (change_orders.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Master users can delete change orders in their tenant" ON public.change_orders
  FOR DELETE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND is_current_user_master()));

CREATE POLICY "Users can create change orders in their tenant" ON public.change_orders
  FOR INSERT TO public
  WITH CHECK (((tenant_id = get_current_user_tenant_id()) AND (get_tenant_id_from_project(project_id) = tenant_id)));

CREATE POLICY "Users can update change orders in their tenant" ON public.change_orders
  FOR UPDATE TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can view change orders in their tenant" ON public.change_orders
  FOR SELECT TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Master users can delete project budgets in their tenant" ON public.project_budgets
  FOR DELETE TO public
  USING (((tenant_id = get_current_user_tenant_id()) AND is_current_user_master()));

CREATE POLICY "Users can create project budgets in their tenant" ON public.project_budgets
  FOR INSERT TO public
  WITH CHECK (((tenant_id = get_current_user_tenant_id()) AND (get_tenant_id_from_project(project_id) = tenant_id)));

CREATE POLICY "Users can update project budgets in their tenant" ON public.project_budgets
  FOR UPDATE TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can view project budgets in their tenant" ON public.project_budgets
  FOR SELECT TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can create project costs in their tenant" ON public.project_costs
  FOR INSERT TO public
  WITH CHECK (((tenant_id = get_current_user_tenant_id()) AND (get_tenant_id_from_project(project_id) = tenant_id)));

CREATE POLICY "Users can delete project costs in their tenant" ON public.project_costs
  FOR DELETE TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can update project costs in their tenant" ON public.project_costs
  FOR UPDATE TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can view project costs in their tenant" ON public.project_costs
  FOR SELECT TO public
  USING ((tenant_id = get_current_user_tenant_id()));

CREATE POLICY "Users can create cap lease costs through their tenant" ON public.cap_lease_costs
  FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can delete cap lease costs through their tenant" ON public.cap_lease_costs
  FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update cap lease costs through their tenant" ON public.cap_lease_costs
  FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view cap lease costs through their tenant" ON public.cap_lease_costs
  FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can create consumable costs through their tenant" ON public.consumable_costs
  FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can delete consumable costs through their tenant" ON public.consumable_costs
  FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update consumable costs through their tenant" ON public.consumable_costs
  FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view consumable costs through their tenant" ON public.consumable_costs
  FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can create equipment costs through their tenant" ON public.equipment_costs
  FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can delete equipment costs through their tenant" ON public.equipment_costs
  FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update equipment costs through their tenant" ON public.equipment_costs
  FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view equipment costs through their tenant" ON public.equipment_costs
  FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can create labor costs through their tenant" ON public.labor_costs
  FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can delete labor costs through their tenant" ON public.labor_costs
  FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update labor costs through their tenant" ON public.labor_costs
  FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view labor costs through their tenant" ON public.labor_costs
  FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can create material costs through their tenant" ON public.material_costs
  FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can delete material costs through their tenant" ON public.material_costs
  FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update material costs through their tenant" ON public.material_costs
  FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view material costs through their tenant" ON public.material_costs
  FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can create other costs through their tenant" ON public.other_costs
  FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can delete other costs through their tenant" ON public.other_costs
  FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update other costs through their tenant" ON public.other_costs
  FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view other costs through their tenant" ON public.other_costs
  FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can create subcontractor costs through their tenant" ON public.subcontractor_costs
  FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can delete subcontractor costs through their tenant" ON public.subcontractor_costs
  FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can update subcontractor costs through their tenant" ON public.subcontractor_costs
  FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

CREATE POLICY "Users can view subcontractor costs through their tenant" ON public.subcontractor_costs
  FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id FROM projects WHERE (projects.tenant_id = get_current_user_tenant_id()))));

-- View. reloptions were null in production; Postgres then treats the view
-- as SECURITY DEFINER (owner = postgres). It left-joins auth.users and is
-- granted to anon/authenticated -- a security advisor finding.
CREATE OR REPLACE VIEW public.user_management_view AS
 SELECT u.id,
    u.tenant_id,
    u.name,
    u.email,
    u.role,
    u.permissions,
    u.is_active,
    u.force_password_change,
    u.last_login,
    u.created_at,
    u.updated_at,
    au.last_sign_in_at,
    au.email_confirmed_at,
        CASE
            WHEN u.force_password_change = true THEN 'Pending First Login'::text
            WHEN u.last_login IS NULL THEN 'Never Logged In'::text
            WHEN u.is_active = false THEN 'Inactive'::text
            ELSE 'Active'::text
        END AS status
   FROM users u
     LEFT JOIN auth.users au ON u.id = au.id;

-- Grants: production gives anon and authenticated full table privileges
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on every
-- public table and on user_management_view. password_hash is still
-- selectable by both roles. RLS is what is supposed to restrict access.

GRANT ALL ON TABLE public.tenants TO anon, authenticated;
GRANT ALL ON TABLE public.users TO anon, authenticated;
GRANT ALL ON TABLE public.projects TO anon, authenticated;
GRANT ALL ON TABLE public.employees TO anon, authenticated;
GRANT ALL ON TABLE public.change_orders TO anon, authenticated;
GRANT ALL ON TABLE public.change_order_budgets TO anon, authenticated;
GRANT ALL ON TABLE public.project_costs TO anon, authenticated;
GRANT ALL ON TABLE public.project_budgets TO anon, authenticated;
GRANT ALL ON TABLE public.customer_invoices TO anon, authenticated;
GRANT ALL ON TABLE public.attachments TO anon, authenticated;
GRANT ALL ON TABLE public.audit_logs TO anon, authenticated;
GRANT ALL ON TABLE public.labor_costs TO anon, authenticated;
GRANT ALL ON TABLE public.material_costs TO anon, authenticated;
GRANT ALL ON TABLE public.equipment_costs TO anon, authenticated;
GRANT ALL ON TABLE public.other_costs TO anon, authenticated;
GRANT ALL ON TABLE public.cap_lease_costs TO anon, authenticated;
GRANT ALL ON TABLE public.consumable_costs TO anon, authenticated;
GRANT ALL ON TABLE public.subcontractor_costs TO anon, authenticated;
GRANT ALL ON TABLE public.user_management_view TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_current_user_tenant_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_master() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_id_from_project(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_tenant(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_user_invitation(text, uuid, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage (schema already exists after `supabase start`)
-- Production bucket: id=name=attachments, public=false, file_size_limit=50MiB,
-- allowed_mime_types null, type=STANDARD. storage.objects has RLS enabled.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', false, 52428800)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Users can delete files from their tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload files to their tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can view files from their tenant" ON storage.objects;

CREATE POLICY "Users can delete files from their tenant" ON storage.objects
  FOR DELETE TO public
  USING (((bucket_id = 'attachments'::text) AND (auth.uid() IS NOT NULL) AND ((storage.foldername(name))[1] = ( SELECT (users.tenant_id)::text AS tenant_id FROM users WHERE (users.id = auth.uid())))));

CREATE POLICY "Users can upload files to their tenant" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (((bucket_id = 'attachments'::text) AND (auth.uid() IS NOT NULL) AND ((storage.foldername(name))[1] = ( SELECT (users.tenant_id)::text AS tenant_id FROM users WHERE (users.id = auth.uid())))));

CREATE POLICY "Users can view files from their tenant" ON storage.objects
  FOR SELECT TO public
  USING (((bucket_id = 'attachments'::text) AND (auth.uid() IS NOT NULL) AND ((storage.foldername(name))[1] = ( SELECT (users.tenant_id)::text AS tenant_id FROM users WHERE (users.id = auth.uid())))));

COMMIT;

-- ===========================================================================
-- SYNTHETIC SEED (not production data)
-- 2 tenants, 3 users each, ids aligned with auth.users.
-- Plus one project per tenant and a couple of cost/invoice rows so RLS
-- policies have something to filter.
--
-- Run after the schema above, against a local `supabase start` database.
-- If the auth.users insert fails (column set differs by CLI version),
-- create the six users another way and keep these UUIDs.
-- Default password for every synthetic user: ChangeMe!12345
-- ===========================================================================

BEGIN;

-- Synthetic fixed UUIDs
-- tenants
--   aaaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1  acme-test
--   aaaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2  beta-test
-- users (auth.users.id = public.users.id)
--   acme master  11111111-1111-4111-8111-1111111111a1
--   acme entry   11111111-1111-4111-8111-1111111111a2
--   acme office  11111111-1111-4111-8111-1111111111a3
--   beta master  11111111-1111-4111-8111-1111111111b1
--   beta entry   11111111-1111-4111-8111-1111111111b2
--   beta office  11111111-1111-4111-8111-1111111111b3

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Best-effort auth.users + identities insert for local Supabase.
-- instance_id is the default local instance.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111a1',
   'authenticated', 'authenticated', 'master-a@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Acme Master"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111a2',
   'authenticated', 'authenticated', 'entry-a@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Acme Entry"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111a3',
   'authenticated', 'authenticated', 'office-a@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Acme Office"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111b1',
   'authenticated', 'authenticated', 'master-b@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Beta Master"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111b2',
   'authenticated', 'authenticated', 'entry-b@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Beta Entry"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-1111111111b3',
   'authenticated', 'authenticated', 'office-b@example.test',
   crypt('ChangeMe!12345', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Beta Office"}',
   now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- identities (ignore if the table/columns differ)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at,
  created_at, updated_at
)
SELECT
  u.id, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', u.id::text, now(), now(), now()
FROM auth.users u
WHERE u.id IN (
  '11111111-1111-4111-8111-1111111111a1',
  '11111111-1111-4111-8111-1111111111a2',
  '11111111-1111-4111-8111-1111111111a3',
  '11111111-1111-4111-8111-1111111111b1',
  '11111111-1111-4111-8111-1111111111b2',
  '11111111-1111-4111-8111-1111111111b3'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, subdomain, name, email, status, plan)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'acme-test', 'Acme Test Co', 'billing-a@example.test', 'active', 'professional'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'beta-test', 'Beta Test Co', 'billing-b@example.test', 'active', 'professional');

INSERT INTO public.users (id, tenant_id, name, email, role, permissions, is_active, force_password_change, password_hash)
VALUES
  ('11111111-1111-4111-8111-1111111111a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Acme Master', 'master-a@example.test', 'master', '{}'::jsonb, true, false, NULL),
  ('11111111-1111-4111-8111-1111111111a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Acme Entry',  'entry-a@example.test',  'entry',  '{}'::jsonb, true, false, NULL),
  ('11111111-1111-4111-8111-1111111111a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Acme Office', 'office-a@example.test', 'office', '{}'::jsonb, true, false, NULL),
  ('11111111-1111-4111-8111-1111111111b1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Beta Master', 'master-b@example.test', 'master', '{}'::jsonb, true, false, NULL),
  ('11111111-1111-4111-8111-1111111111b2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Beta Entry',  'entry-b@example.test',  'entry',  '{}'::jsonb, true, false, NULL),
  ('11111111-1111-4111-8111-1111111111b3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Beta Office', 'office-b@example.test', 'office', '{}'::jsonb, true, false, NULL);

INSERT INTO public.projects (id, tenant_id, "jobNumber", "jobName", customer, "fieldShopBoth", "totalContractValue", status)
VALUES
  ('22222222-2222-4222-8222-2222222222a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'JOB-A-001', 'Acme Test Job', 'Acme Customer', 'Both', 100000, 'Active'),
  ('22222222-2222-4222-8222-2222222222b1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'JOB-B-001', 'Beta Test Job', 'Beta Customer', 'Both', 75000, 'Active');

INSERT INTO public.project_budgets (tenant_id, project_id, material_budget, labor_budget)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-2222222222a1', 10000, 20000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-2222222222b1', 8000, 15000);

INSERT INTO public.project_costs (tenant_id, project_id, category, date, cost, vendor, description)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-2222222222a1', 'material', '2026-01-15', 250.00, 'Test Vendor A', 'Synthetic cost A'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-2222222222b1', 'material', '2026-01-16', 175.00, 'Test Vendor B', 'Synthetic cost B');

INSERT INTO public.customer_invoices (tenant_id, project_id, invoice_number, amount, date_billed)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-2222222222a1', 'INV-A-001', 500.00, '2026-01-20'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-2222222222b1', 'INV-B-001', 400.00, '2026-01-21');

COMMIT;


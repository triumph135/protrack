-- Drops employees.job_role. Does not drop employee_project_rates or its
-- unique constraint; 20261119000100 owns that table. Does not change
-- rates, costs, or the other employee columns.

begin;

alter table public.employees drop column if exists job_role;

commit;

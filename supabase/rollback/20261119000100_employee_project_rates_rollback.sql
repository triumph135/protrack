-- Rolls back per-project employee rates. Drops the new table and helper.
-- Does not change employees.standard_rate or any saved cost row.

begin;

drop function if exists public.employee_rates_as_of(uuid, uuid, date);
drop table if exists public.employee_project_rates;

commit;

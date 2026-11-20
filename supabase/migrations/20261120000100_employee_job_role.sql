-- Phase 2b follow-up: optional job role, and a guarded rate unique key.
--
-- Purpose
--   Add employees.job_role (nullable text). Existing employee rows keep
--   every other column. Reaffirm employee_project_rates_unique on
--   (employee_id, project_id, effective_date) after refusing to continue
--   when that combination is already duplicated. No duplicate rows are
--   deleted.
--
-- Assumes
--   20261119000100 is applied. Safe to run twice. One transaction.
--
-- Verify
--   supabase/tests/phase2b_checks.sql reads job_role and rejects a
--   second rate for the same employee, project, and effective date.

begin;

alter table public.employees
  add column if not exists job_role text;

do $$
declare
  v_dupes integer;
begin
  if to_regclass('public.employee_project_rates') is null then
    return;
  end if;

  select count(*) into v_dupes
  from (
    select 1
    from public.employee_project_rates
    group by employee_id, project_id, effective_date
    having count(*) > 1
  ) duplicated;

  if v_dupes > 0 then
    raise exception 'employee_project_rates has % duplicate employee, project, and effective date groups. Edit those rows before adding the unique constraint.', v_dupes;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_project_rates_unique'
      and conrelid = 'public.employee_project_rates'::regclass
  ) then
    alter table public.employee_project_rates
      add constraint employee_project_rates_unique
      unique (employee_id, project_id, effective_date);
  end if;
end $$;

commit;

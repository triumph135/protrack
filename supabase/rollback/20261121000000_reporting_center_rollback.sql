-- Rolls back the Reporting Center tables, functions, and timezone trigger.
-- Drops only objects created by 20261121000000_reporting_center.sql.
-- Those tables hold no data that existed before this migration.

begin;

drop trigger if exists report_schedules_tz_resync on public.tenants;
drop trigger if exists report_recipient_same_tenant on public.report_schedule_recipients;
drop trigger if exists report_definitions_updated_at on public.report_definitions;
drop trigger if exists report_schedules_updated_at on public.report_schedules;

drop policy if exists report_definitions_select on public.report_definitions;
drop policy if exists report_schedules_select on public.report_schedules;
drop policy if exists report_schedule_recipients_select on public.report_schedule_recipients;
drop policy if exists report_runs_select on public.report_runs;
drop policy if exists report_deliveries_select on public.report_deliveries;

drop function if exists public.report_schedules_tz_resync();
drop function if exists public.claim_due_report_runs(int);
drop function if exists public.report_next_run_at(text, smallint, smallint, smallint, text, timestamptz);
drop function if exists public.report_access_scope(uuid);
drop function if exists public.report_recipient_same_tenant();
drop function if exists public.report_user_is_recipient(uuid);
drop function if exists public.report_user_can_manage_schedule(uuid);

drop table if exists public.report_deliveries;
drop table if exists public.report_runs;
drop table if exists public.report_schedule_recipients;
drop table if exists public.report_schedules;
drop table if exists public.report_definitions;

commit;

-- Operator script. Not a migration. Do not run this from CI, from a
-- Vercel build, or against a database you have not backed up.
--
-- What it does
--   Every 15 minutes, pg_cron calls the app at POST /api/reports/cron.
--   The URL and bearer secret are read from Supabase Vault at run time.
--   This file contains no secret values.
--
-- Before you run it
--   1. Apply 20261121000000_reporting_center.sql.
--   2. In Vault, create:
--        reports_tick_url     = https://app.protrackusa.com/api/reports/cron
--        reports_cron_secret  = the same value as Vercel REPORTS_CRON_SECRET
--   3. Staging does not get this job. Use Send now with REPORTS_EMAIL_MODE=log.
--
-- pg_net
--   Supabase usually already has pg_net in the net schema (net.http_post).
--   If the extension is missing, this script creates it in the extensions
--   schema, which is what the Reporting Center spec asks for. The scheduled
--   command calls whichever schema actually holds http_post.
--
-- DST and timing
--   The job fires every 15 minutes. A report set for 7:00 is sent on the
--   first tick at or after 7:00, so the email arrives around 7:00.

create extension if not exists pg_cron;

do $setup$
declare
  v_schema text;
  v_command text;
  v_jobid bigint;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_net';

  if v_schema is null then
    create extension pg_net with schema extensions;
    v_schema := 'extensions';
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is not available. Create it before scheduling report email.';
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'reports_tick_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'reports_cron_secret') then
    raise exception 'Create Vault secrets reports_tick_url and reports_cron_secret first. Do not put the values in this file.';
  end if;

  for v_jobid in
    select jobid from cron.job where jobname = 'protrack-reports-tick'
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  v_command := format($job$
    select %I.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reports_tick_url'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reports_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  $job$, v_schema);

  perform cron.schedule('protrack-reports-tick', '*/15 * * * *', v_command);
end
$setup$;

-- Operator script. Removes the Reporting Center cron job.
-- Leaves pg_cron and pg_net installed. Does not delete Vault secrets
-- and does not print secret values.

do $teardown$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'protrack-reports-tick'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$teardown$;

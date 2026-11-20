#!/usr/bin/env bash
# Local-only. Rebuilds Postgres, runs the RLS suite, the Phase 2 checks,
# then applies every migration twice, rolls them back, and reapplies them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${PROTRACK_DB:-protrack}"
PSQL=(psql -v ON_ERROR_STOP=1)

if [[ "$(id -un)" == "postgres" ]]; then
  RUN=()
else
  RUN=(sudo -u postgres)
fi

cd "${ROOT}"
SKIP_SEED=1 bash scripts/db-local-reset.sh
echo "RLS isolation"
"${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f supabase/tests/rls_isolation.sql >/tmp/protrack-rls.txt
grep -c PASS /tmp/protrack-rls.txt

echo "Phase 2 seed"
"${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f supabase/seed/phase2_synthetic.sql >/dev/null
echo "Phase 2 checks"
"${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f supabase/tests/phase2_checks.sql >/tmp/protrack-phase2.txt
grep -E 'NOTICE|FAIL' /tmp/protrack-phase2.txt || true

echo "Phase 2b checks"
"${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f supabase/tests/phase2b_checks.sql >/tmp/protrack-phase2b.txt
grep -E 'NOTICE|FAIL' /tmp/protrack-phase2b.txt || true

echo "Apply every migration a second time"
for f in supabase/migrations/*.sql; do
  echo "  -> ${f}"
  "${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f "${f}" >/dev/null
done

echo "Phase 2c seed"
"${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f supabase/seed/phase2c_synthetic.sql >/dev/null
echo "Phase 2c checks"
"${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f supabase/tests/phase2c_checks.sql >/tmp/protrack-phase2c.txt
grep -E 'NOTICE|FAIL' /tmp/protrack-phase2c.txt || true

echo "Rollback Phase 2c, Phase 2b, and Phase 2, then reapply"
for f in \
  supabase/rollback/20261121000000_reporting_center_rollback.sql \
  supabase/rollback/20261120000100_employee_job_role_rollback.sql \
  supabase/rollback/20261120000000_reversal_positive_amounts_rollback.sql \
  supabase/rollback/20261119000100_employee_project_rates_rollback.sql \
  supabase/rollback/20261119000000_reversals_and_events_rollback.sql \
  supabase/rollback/20261118000400_invoice_collected_rollback.sql \
  supabase/rollback/20261118000300_baseline_access_rollback.sql \
  supabase/rollback/20261118000200_company_settings_rollback.sql \
  supabase/rollback/20261118000100_team_invites_rollback.sql \
  supabase/rollback/20261118000000_cost_categories_rollback.sql
do
  echo "  -> ${f}"
  "${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f "${f}" >/dev/null
done
for f in \
  supabase/migrations/20261118000000_cost_categories.sql \
  supabase/migrations/20261118000100_team_invites.sql \
  supabase/migrations/20261118000200_company_settings.sql \
  supabase/migrations/20261118000300_baseline_access.sql \
  supabase/migrations/20261118000400_invoice_collected.sql \
  supabase/migrations/20261119000000_reversals_and_events.sql \
  supabase/migrations/20261119000100_employee_project_rates.sql \
  supabase/migrations/20261120000000_reversal_positive_amounts.sql \
  supabase/migrations/20261120000100_employee_job_role.sql \
  supabase/migrations/20261121000000_reporting_center.sql
do
  echo "  -> ${f}"
  "${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f "${f}" >/dev/null
done

echo "RLS isolation after rollback and reapply"
SKIP_SEED=1 bash scripts/db-local-reset.sh >/dev/null
"${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f supabase/tests/rls_isolation.sql >/tmp/protrack-rls-after.txt
grep -c PASS /tmp/protrack-rls-after.txt
echo "SQL checks finished"

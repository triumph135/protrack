#!/usr/bin/env bash
# Rebuild a local Postgres database from the Nov 13 production schema
# snapshot, the two RLS migrations, the Phase 2 migrations, and the
# synthetic seed. Never points at a remote database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${PROTRACK_DB:-protrack}"
PSQL=(psql -v ON_ERROR_STOP=1)

if [[ "$(id -un)" == "postgres" ]]; then
  RUN=()
else
  RUN=(sudo -u postgres)
fi

echo "Resetting local database ${DB_NAME}"
"${RUN[@]}" "${PSQL[@]}" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null
"${RUN[@]}" "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
"${RUN[@]}" "${PSQL[@]}" -d postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'protrack') THEN CREATE ROLE protrack LOGIN SUPERUSER PASSWORD 'protrack'; END IF; END \$\$;"
"${RUN[@]}" "${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER protrack;"
# The snapshot creates SQL functions before the tables they mention.
# Postgres checks those bodies at CREATE time unless this is off. Local only.
"${RUN[@]}" "${PSQL[@]}" -d postgres -c "ALTER DATABASE ${DB_NAME} SET check_function_bodies = off;"

load() {
  echo "  -> $1"
  "${RUN[@]}" "${PSQL[@]}" -d "${DB_NAME}" -f "$1"
}

load "${ROOT}/scripts/local/00-bootstrap.sql"
load "${ROOT}/supabase/snapshots/prod-schema-2026-11-13.sql"
load "${ROOT}/supabase/migrations/20261113201043_enable_rls.sql"
load "${ROOT}/supabase/migrations/20261117235751_storage_rls.sql"
load "${ROOT}/supabase/migrations/20261118000000_cost_categories.sql"
load "${ROOT}/supabase/migrations/20261118000100_team_invites.sql"
load "${ROOT}/supabase/migrations/20261118000200_company_settings.sql"
load "${ROOT}/supabase/migrations/20261118000300_baseline_access.sql"
load "${ROOT}/supabase/migrations/20261118000400_invoice_collected.sql"
load "${ROOT}/supabase/migrations/20261119000000_reversals_and_events.sql"
load "${ROOT}/supabase/migrations/20261119000100_employee_project_rates.sql"
load "${ROOT}/supabase/migrations/20261120000000_reversal_positive_amounts.sql"
load "${ROOT}/supabase/migrations/20261120000100_employee_job_role.sql"
if [[ "${SKIP_SEED:-}" != "1" ]]; then
  load "${ROOT}/supabase/seed/phase2_synthetic.sql"
fi

echo "Local database ${DB_NAME} is ready."

# ProTrack

Multi-tenant project cost tracking. Companies keep jobs, change orders, labor, materials, equipment, subcontractor costs, and customer invoices in separate workspaces.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

Required environment variables:

| Name | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Invitation emails and invited-user setup. |
| `NEXT_PUBLIC_SITE_URL` | Server. Used in invitation links. No trailing slash. |
| `RESEND_API_KEY` | Server only. Optional. Invites still work as copyable links when it is empty. |
| `EMAIL_FROM` | Server. Sender for invite email, after the domain is verified. |

Set the same values in the Vercel project. Do not commit `.env.local`.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Supabase

The app filters queries by `tenant_id`, but that is not enough on its own. Apply these in the Supabase SQL editor, in order, on a staging project first:

1. `supabase/migrations/20261113201043_enable_rls.sql` (applied in production as version `20261113201043`)
2. `supabase/migrations/20261117235751_storage_rls.sql` (applied in production as version `20261117235751`, without enabling RLS on `storage.objects`)
3. `supabase/migrations/20261118000000_cost_categories.sql`
4. `supabase/migrations/20261118000100_team_invites.sql`
5. `supabase/migrations/20261118000200_company_settings.sql`
6. `supabase/migrations/20261118000300_baseline_access.sql` — denies API access to the cost baseline table
7. `supabase/migrations/20261118000400_invoice_collected.sql` — adds `customer_invoices.amount_collected` (default 0)
8. `supabase/migrations/20261119000000_reversals_and_events.sql` — reversal columns, credit memos, `record_events`, and a stricter `attachment_project_visible`
9. `supabase/migrations/20261119000100_employee_project_rates.sql` — per-project employee rates and `employee_rates_as_of`
10. `supabase/migrations/20261120000000_reversal_positive_amounts.sql` — reversal and credit amounts accept a positive magnitude and store the opposite sign
11. `supabase/migrations/20261120000100_employee_job_role.sql` — optional `employees.job_role`, and a duplicate check before `employee_project_rates_unique`

Apply the Phase 2 files before the Phase 2 app, then the Phase 2b files in the order above. Each file keeps the previous app working. The baseline file only locks an internal table. Rollbacks live in `supabase/rollback/` and run in reverse order. Applying SQL to production is a separate, reviewed step. Nothing in this repo runs those files against a remote database.

Local Postgres, with no connection to production:

```bash
bash scripts/db-local-reset.sh
bash scripts/db-local-test.sh
```

`scripts/db-local-reset.sh` loads `supabase/snapshots/prod-schema-2026-11-13.sql`, then the migrations above, then `supabase/seed/phase2_synthetic.sql`. The test script applies every migration twice, rolls the Phase 2 files back, and reapplies them.

The second script expects a private Storage bucket named `attachments`. Confirm the bucket is not public.

Also confirm in Supabase Auth that redirect URLs include:

- `https://protrack-app.vercel.app/auth/callback`
- `http://localhost:3000/auth/callback`
- the invitation and password-reset pages you use

Each login can belong to one organization. `users.id` is the Supabase Auth user id.

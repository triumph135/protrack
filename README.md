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

1. `supabase/migrations/20260313000000_enable_rls.sql`
2. `supabase/migrations/20260313000001_storage_rls.sql`

The second script expects a private Storage bucket named `attachments`. Confirm the bucket is not public.

Also confirm in Supabase Auth that redirect URLs include:

- `https://protrack-app.vercel.app/auth/callback`
- `http://localhost:3000/auth/callback`
- the invitation and password-reset pages you use

Each login can belong to one organization. `users.id` is the Supabase Auth user id.

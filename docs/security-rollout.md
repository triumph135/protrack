# Security rollout plan

This change fixes how ProTrack handles sign up, company setup, and team invitations, and locks down the database. Production is changed in a set order so the live customer is never broken.

## What was wrong

1. Row Level Security was off on the `users` and `tenants` tables. Anyone with the public key could read or edit every user and company.
2. A signed in user could promote themselves to administrator or move themselves into another company.
3. The `user_invitations` table did not exist in production, so inviting teammates could not work.
4. Several server endpoints had no login check, including one that sent invitation emails to any address.
5. Company setup and the administrator role were assigned from the browser in several separate steps that could fail halfway.

## What changed

Database (two files in `supabase/migrations`)

- Part 1, additive: creates `user_invitations`, adds the one step `create_tenant_for_current_user()` function, pins function search paths, removes anonymous access to helper functions.
- Part 2, lockdown: turns on Row Level Security for users and tenants with new policies, blocks changes to role, permissions, tenant and billing columns from the browser, creates the profile row automatically at signup, removes the unused view that exposed auth data and the broken invite function.

Application

- Administrators invite teammates through one authenticated server route (`/api/team/invite`). Role and permissions are checked on the server.
- Accepting an invitation uses a one time token that is claimed atomically.
- Company setup is one database call.
- Removed: `invite-user`, `invite-existing-user`, `check-user-exists`, the API `accept-invitation` route, and the `join-tenant` page. They had no login checks or relied on browser writes.
- One behavior change: an email address can belong to one organization only. Inviting an email that already has an account with another organization is refused with a clear message.

## Order of operations for production

Do not skip ahead. Part 2 must come last.

1. Backup. In Supabase, open the ProTrack-Prod project, then Database, then Backups. Confirm a recent backup exists. Note the time.
2. Run part 1. Open SQL Editor on ProTrack-Prod, paste `20261019000001_security_part1_additive.sql`, run it. This only adds things.
3. Test on a Vercel preview. Open the pull request preview link. Preview deployments use the environment variables set for Preview in Vercel. Point them at the staging Supabase project first so tests do not touch production data.
4. Merge the pull request. Vercel deploys to production.
5. Smoke test production with the current admin account:
   - Sign in and open Users.
   - Invite a test email you control, with the view role.
   - Open the email link, set a password, sign in as that person.
   - In a private window, register a new account and create a test workspace.
6. Run part 2. Paste `20261019000002_security_part2_lockdown.sql` into SQL Editor on ProTrack-Prod and run it.
7. Smoke test again using the same steps. Also confirm the existing customer can sign in and see their projects.

## Rollback for part 2

If anything fails after step 6, run this in SQL Editor. It restores the old behavior while we fix the problem.

```sql
alter table public.users disable row level security;
alter table public.tenants disable row level security;
drop trigger if exists guard_users_privileged_columns on public.users;
drop trigger if exists guard_tenants_billing_columns on public.tenants;
drop trigger if exists on_auth_user_created on auth.users;
```

## Settings in the Supabase dashboard

- Authentication, Password security: turn on leaked password protection (plan permitting).
- Settings, Infrastructure: upgrade Postgres to apply the available security patches.
- Authentication, SMTP settings: connect a real email provider such as Resend. The built in sender is limited to a few emails an hour, which will block invitations as soon as more than a few people sign up.

## Cleanup questions

- Production has 9 companies and 12 users, and 2 users with no company. Confirm which are real customers before deleting any test data.

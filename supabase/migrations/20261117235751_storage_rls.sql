-- Apply after 20261113201043_enable_rls.sql.
-- Production recorded this file as version 20261117235751 (storage_rls).
-- The attachments bucket is already private in production and already has
-- three policies. Those policies are dropped by their exact names and
-- replaced. Paths stay {tenant_id}/{entity_type}/{entity_id}/{filename}.
-- There is no UPDATE policy in production; this adds one for the same path.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do update
set public = false;

drop policy if exists "Users can delete files from their tenant" on storage.objects;
drop policy if exists "Users can upload files to their tenant" on storage.objects;
drop policy if exists "Users can view files from their tenant" on storage.objects;
drop policy if exists attachments_storage_select on storage.objects;
drop policy if exists attachments_storage_insert on storage.objects;
drop policy if exists attachments_storage_update on storage.objects;
drop policy if exists attachments_storage_delete on storage.objects;

-- Do not run `alter table storage.objects enable row level security` here.
-- Production rejected that statement for non-owners (SQLSTATE 42501). RLS on
-- storage.objects is already on in Supabase, and the local bootstrap turns
-- it on before this file runs. The version applied to prod on 2026-11-17
-- omitted this line; the repo now matches that applied script.

create policy attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy attachments_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

create policy attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

commit;

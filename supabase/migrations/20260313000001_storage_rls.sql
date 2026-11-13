-- Apply after 20260313000000_enable_rls.sql.
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

-- Production already has RLS on. Enabling it here is a no-op there, and
-- it is what makes the new policies apply on a database that only has them.
alter table storage.objects enable row level security;

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

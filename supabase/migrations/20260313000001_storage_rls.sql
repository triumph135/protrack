-- Run after 20260313000000_enable_rls.sql.
-- The app stores files at {tenant_id}/{entity_type}/{entity_id}/{filename}
-- in a private bucket named "attachments".

drop policy if exists attachments_storage_select on storage.objects;
drop policy if exists attachments_storage_insert on storage.objects;
drop policy if exists attachments_storage_update on storage.objects;
drop policy if exists attachments_storage_delete on storage.objects;

create policy attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()
  );

create policy attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()
  );

create policy attachments_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()
  );

create policy attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()
  );

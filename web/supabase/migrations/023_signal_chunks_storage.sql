-- 023_signal_chunks_storage.sql — Storage bucket + RLS for raw PMD blobs
--
-- Apply manually in Supabase Studio (SQL editor) AFTER 023_signal_chunks.sql.
-- The storage schema is owned by Supabase and not managed via the migrations folder.
--
-- Path convention: <session_uuid>/<stream>/<chunk_index_padded>.bin
--   e.g. 2032fe73-fd4c-4206-b25b-fb8079736326/acc/000042.bin

insert into storage.buckets (id, name, public)
values ('signal-blobs', 'signal-blobs', false)
on conflict (id) do nothing;

create policy "riders upload to own session paths"
  on storage.objects for insert
  with check (
    bucket_id = 'signal-blobs'
    and exists (
      select 1 from sessions
      where sessions.id::text = split_part(name, '/', 1)
        and sessions.rider_id = auth.uid()
        and sessions.status = 'active'
    )
  );

create policy "riders read own session paths"
  on storage.objects for select
  using (
    bucket_id = 'signal-blobs'
    and exists (
      select 1 from sessions
      where sessions.id::text = split_part(name, '/', 1)
        and (sessions.rider_id = auth.uid() or is_admin_check())
    )
  );

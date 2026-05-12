-- 023_signal_chunks.sql — index table for raw PMD ACC + ECG blobs in Storage
-- One row per ~30s binary chunk uploaded to the 'signal-blobs' Storage bucket.
-- Bucket + storage RLS are configured separately (see 023_signal_chunks_storage.sql,
-- which must be applied via Supabase Studio because the storage schema is not
-- managed by the migrations folder).

create table signal_chunks (
  id              bigserial primary key,
  session_id      uuid not null references sessions(id) on delete cascade,
  stream          text not null check (stream in ('acc','ecg')),
  chunk_index     int not null,
  start_t_ms      bigint not null,           -- relative to sessions.start_time
  end_t_ms        bigint not null,
  sample_rate_hz  int not null,
  resolution_bits int not null,
  range_g         int,                       -- ACC only; NULL for ECG
  channels        int not null,              -- 3 for ACC (XYZ interleaved), 1 for ECG
  storage_path    text not null,             -- bucket-relative, e.g. "<session_id>/acc/000042.bin"
  byte_count      int not null,
  created_at      timestamptz default now(),
  unique (session_id, stream, chunk_index)
);

create index signal_chunks_session_idx on signal_chunks(session_id, stream, chunk_index);

comment on table signal_chunks is 'Index of raw PMD signal blobs stored in the signal-blobs Storage bucket';
comment on column signal_chunks.start_t_ms is 'Chunk start, ms relative to sessions.start_time';
comment on column signal_chunks.storage_path is 'Path inside the signal-blobs bucket: <session_id>/<stream>/<chunk_index_padded>.bin';
comment on column signal_chunks.range_g is 'Accelerometer full-scale range in g; NULL for ECG';

alter table signal_chunks enable row level security;

create policy "riders insert own signal chunks"
  on signal_chunks for insert
  with check (
    exists (select 1 from sessions
            where sessions.id = signal_chunks.session_id
              and sessions.rider_id = auth.uid()
              and sessions.status = 'active')
  );

create policy "riders read own signal chunks"
  on signal_chunks for select
  using (
    exists (select 1 from sessions
            where sessions.id = signal_chunks.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

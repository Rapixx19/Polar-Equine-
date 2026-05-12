-- 022_drop_per_sample_signal_tables.sql — replace per-sample storage with chunked blobs
-- The samples_acc and samples_ecg tables created in migration 002 were never written
-- to (HR was the only stream wired in slices 5–11). PMD ingestion (slice 13.A/E) keeps
-- raw signal data in Supabase Storage chunks indexed by signal_chunks (migration 023).
--
-- samples_hr stays — it still backs the HR ingest path and is read by the algo service.

drop table if exists samples_acc cascade;
drop table if exists samples_ecg cascade;

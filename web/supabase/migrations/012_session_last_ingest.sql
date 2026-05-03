-- 012_session_last_ingest.sql — track last successful ingest for stale-session cleanup.
-- Spec source: docs/shared/09-v0-1-hardening.md Fix 5.
-- Updated by /api/ingest/samples on every successful insert; consumed by
-- /api/cron/abandon-stale to mark sessions idle >12h as 'abandoned'.

alter table sessions add column last_ingest_at timestamptz;

create index sessions_active_stale_idx on sessions(last_ingest_at)
  where status = 'active';

comment on column sessions.last_ingest_at is
  'Updated on every successful POST /api/ingest/samples; cron abandons rows older than 12h.';

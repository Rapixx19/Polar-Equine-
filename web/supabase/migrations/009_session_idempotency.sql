-- 009_session_idempotency.sql — client-supplied idempotency key for session start
-- Rule 12: rerunning POST /api/sessions with the same client_session_id returns the same row.
-- Spec source: docs/shared/09-v0-1-hardening.md Fix 4

alter table sessions
  add column client_session_id uuid;

create unique index sessions_client_id_idx
  on sessions(client_session_id, rider_id)
  where client_session_id is not null;

create unique index sessions_one_active_per_horse_idx
  on sessions(horse_id)
  where status = 'active';

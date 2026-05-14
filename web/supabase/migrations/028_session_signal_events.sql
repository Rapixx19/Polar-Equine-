-- 028_session_signal_events.sql — persisted intervals where the H10 strap
-- lost contact or produced excessive RR artifact (motion noise, dry skin,
-- band off). Lets the admin detail page render a quality timeline overlay
-- on the HR trace, and gives the freelancer-export bundle a way to mark
-- which spans of raw data should be ignored when recomputing metrics.
--
-- Source-of-truth is the client transition detector (lib/quality/
-- transition-detector.ts) — only sealed intervals land here, never the
-- per-second state stream. A "good" interval is implicit between two
-- recorded events (or before the first / after the last).

create table session_signal_events (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  kind            text not null check (kind in ('weak','lost')),
  t_start_ms      bigint not null,
  t_end_ms        bigint not null,
  created_at      timestamptz not null default now(),
  check (t_end_ms >= t_start_ms)
);

create index session_signal_events_session_idx
  on session_signal_events(session_id, t_start_ms);

alter table session_signal_events enable row level security;

-- Riders see their own sessions' events; admins see everything.
create policy "riders read own session signal events"
  on session_signal_events for select
  using (
    exists (select 1 from sessions s
            where s.id = session_signal_events.session_id
              and (s.rider_id = auth.uid() or is_admin_check()))
  );

-- Riders can insert events only while their own session is still active.
-- The recording client is the only writer; admins don't backfill.
create policy "riders insert own active session signal events"
  on session_signal_events for insert
  with check (
    exists (select 1 from sessions s
            where s.id = session_signal_events.session_id
              and s.rider_id = auth.uid()
              and s.status = 'active')
  );

comment on table session_signal_events is
  'Sealed intervals where HR capture quality dropped below "good". '
  'Written by the recording client as transitions close; consumed by '
  'admin session detail (timeline overlay) and the anonymised export.';

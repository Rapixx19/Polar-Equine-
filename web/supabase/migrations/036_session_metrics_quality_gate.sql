-- 036_session_metrics_quality_gate.sql — HRV plausibility gate
--
-- Why: 0.6.0 pipeline silently persisted RMSSD=747 ms / SDNN=613 ms rows on
-- noisy strap-handling sessions (Emma's 2026-05-15 ride, session
-- 27e972e5-2c5c-4eff-888a-9f4e065197ba). Equine resting RMSSD literature
-- caps at ~250 ms; >300 is physiologically implausible. RR cleaning quality
-- below 0.5 means more than half the intervals were artefacts.
--
-- This migration:
--   1. Adds a new `metrics_status` enum value `complete_low_quality` so the
--      algo can persist diagnostic context (hr_avg, contact, etc.) while
--      nulling unreliable HRV outputs.
--   2. Adds a `quality_flags` jsonb column to `session_metrics` recording
--      WHY a row was downgraded (e.g. {"rr_cleaning_low": true,
--      "rmssd_implausible": true}). Empty `{}` for clean rows.

alter table session_metrics
  add column if not exists quality_flags jsonb not null default '{}'::jsonb;

comment on column session_metrics.quality_flags is
  'Structured reasons a metrics row is unreliable. Empty {} for clean rows. Set by algo when sessions.metrics_status = complete_low_quality.';

alter table sessions
  drop constraint if exists sessions_metrics_status_check;

alter table sessions
  add constraint sessions_metrics_status_check
  check (metrics_status in (
    'pending', 'computing', 'complete', 'complete_low_quality', 'failed'
  ));

comment on column sessions.metrics_status is
  'lifecycle of algo compute for this session. complete_low_quality = row written but HRV fields are nulled due to plausibility gate failure; see session_metrics.quality_flags for reasons.';

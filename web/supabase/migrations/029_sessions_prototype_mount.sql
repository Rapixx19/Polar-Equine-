-- 029_sessions_prototype_mount.sql
--
-- Adds a single boolean flag to sessions so the admin can later split the
-- corpus into "bare strap" (default) vs "prototype mount" (girth holder we
-- want to evaluate). Data collection is identical in both cases — the flag
-- exists so quality metrics, signal-quality events, and (eventually) ACC
-- gait classifier accuracy can be compared between the two setups.
--
-- Default false: every existing and newly-created row counts as baseline
-- unless the rider explicitly flips the toggle on the pre-recording screen.

alter table sessions
  add column has_prototype_mount boolean not null default false;

comment on column sessions.has_prototype_mount is
  'True when the rider recorded with the experimental girth-mount prototype. '
  'Data pipeline is identical to baseline; flag exists for quality comparison.';

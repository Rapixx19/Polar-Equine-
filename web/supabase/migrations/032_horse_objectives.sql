-- 032_horse_objectives.sql
--
-- Research objectives per horse. The admin sets a target number of sessions
-- and/or target ride minutes for each horse; the /admin UI renders progress
-- bars against actual session counts and ride-minute sums.
--
--  - target_session_count — admin's goal for this horse (e.g. "20 sessions
--                           by end of study"). Nullable: a null target means
--                           no specific goal, and the horse just contributes
--                           ambient data.
--  - target_ride_minutes  — admin's goal for accumulated ride minutes.
--                           Nullable for the same reason.
--  - admin_notes          — private admin reminder about what we want from
--                           this horse ("focus on lunging, prefer mornings",
--                           "low-stress prototype-mount candidate"). Distinct
--                           from the existing `notes` column which may be
--                           rider-visible / older free-text.
--
-- All three are nullable; the API enforces non-negative integers and a
-- 500-char cap on admin_notes. No DB-level check to keep the migration
-- trivial — caps live in the route handler.
--
-- RLS: existing horses SELECT policy (005) already grants admins read.
-- This file adds the parallel UPDATE policy for is_admin_check(), mirroring
-- 026_admin_update_rider_profiles.sql.

alter table horses
  add column target_session_count int,
  add column target_ride_minutes int,
  add column admin_notes text;

comment on column horses.target_session_count is
  'Admin objective: target number of sessions to record with this horse. Nullable.';
comment on column horses.target_ride_minutes is
  'Admin objective: target accumulated ride minutes with this horse. Nullable.';
comment on column horses.admin_notes is
  'Private admin-only notes about this horse and what we want from it. Not visible to riders.';

create policy "admins update any horse"
  on horses for update
  using (is_admin_check())
  with check (is_admin_check());

comment on policy "admins update any horse" on horses is
  'Lets is_admin riders edit horse objectives + admin_notes via the /admin UI. '
  'Non-admin updates remain blocked (no rider update policy exists on horses).';

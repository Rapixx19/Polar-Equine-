-- 020_session_subjective_notes.sql — slice 11.9
--
-- Two new free-text columns on sessions to capture rider-side context the
-- algo can correlate with HR/HRV signals:
--   - horse_feel       : how the horse felt during the ride (subjective state)
--   - cooldown_notes   : observations during cool-down (lameness, breathing,
--                        sweat, recovery, etc.)
--
-- The existing `notes` column on sessions stays — slice 11.9 wires it up as
-- the "what did you do?" field. Renaming risks breaking the existing notes-only
-- branch in PATCH /api/sessions/[id], so we keep the name.
--
-- Additive only. Both columns nullable, no default. Existing rows pick up NULL.
-- 2 KB cap matches the existing `notes` column's intended bound (the API
-- already enforces .max(2000) via Zod for `notes`).

alter table sessions
  add column if not exists horse_feel text,
  add column if not exists cooldown_notes text;

alter table sessions
  drop constraint if exists sessions_horse_feel_len,
  drop constraint if exists sessions_cooldown_notes_len;

alter table sessions
  add constraint sessions_horse_feel_len check (
    horse_feel is null or char_length(horse_feel) <= 2000
  ),
  add constraint sessions_cooldown_notes_len check (
    cooldown_notes is null or char_length(cooldown_notes) <= 2000
  );

comment on column sessions.horse_feel is
  'Subjective rider read on the horse during the ride; max 2000 chars';
comment on column sessions.cooldown_notes is
  'Post-ride observations during cool-down; max 2000 chars';

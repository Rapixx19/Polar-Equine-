-- Slice 11.8 Stage 1 follow-up: tighten sessions_activity_note_check.
--
-- Migration 017's CHECK was permissive: `activity_note IS NULL` short-circuits
-- the OR for any activity_type, so `activity_type='other'` with a NULL note
-- slipped through. The Zod schema rejects that case correctly; the DB did not.
-- This migration replaces the constraint with the symmetric CASE form so the
-- DB matches the API rule: 'other' requires a non-empty note ≤200 chars; every
-- other activity_type requires the note to be NULL.

alter table sessions drop constraint if exists sessions_activity_note_check;

alter table sessions
  add constraint sessions_activity_note_check check (
    case
      when activity_type = 'other'
        then activity_note is not null and char_length(activity_note) between 1 and 200
      else activity_note is null
    end
  );

-- 023_research_program_quota_and_guest_horses.sql — Slice 15.B / 16 dashboard.
--
-- Adds the schema needed to turn the home screen from a transactional launcher
-- into a research-progress dashboard:
--
--   1. Per-rider session quota target (default 30) so the home page can show
--      progress toward the research-program goal. program_end_date is optional
--      and drives the "X days remaining" framing when set.
--
--   2. Guest horses — riders sometimes ride horses that aren't formally
--      assigned to them. Marking those rows is_guest=true keeps them out of
--      the main "My horses" list while still capturing the HR data they
--      generate (valuable for variability in the research dataset). The
--      last_used_at field lets the UI surface recent guests as one-tap
--      shortcuts when the rider re-encounters the same horse.
--
-- No new tables, no enum changes, no RLS changes — RLS on horses already
-- restricts visibility via horse_riders (migration 005); the SECURITY DEFINER
-- create function from migration 021 inserts both rows, and that pattern
-- carries over to guest horses too.

alter table rider_profiles
  add column session_quota_target int  not null default 30,
  add column program_end_date     date null;

comment on column rider_profiles.session_quota_target is
  'How many approved sessions this rider has agreed to contribute to the research program. Drives the home-page progress bar.';
comment on column rider_profiles.program_end_date is
  'Optional deadline for the rider''s participation. NULL means open-ended; set NON-NULL to enable the "days remaining" UI.';

alter table horses
  add column is_guest     boolean    not null default false,
  add column last_used_at timestamptz null;

comment on column horses.is_guest is
  'TRUE for one-time horses added by a rider for a single (or occasional) ride. Excluded from "My horses" but kept queryable as "Recent guests".';
comment on column horses.last_used_at is
  'Wall-clock timestamp of the most recent session against this horse. Used to sort guest horses for the recent-guests picker; touched by the API when a session is created.';

-- Sparse partial index — guest lookups are by-creator + recency only, so we
-- skip the bulk of horses (is_guest=false) entirely. `horses` has no
-- rider_id column (riders are linked via horse_riders); `created_by` is the
-- canonical "this rider made this horse" reference and is the column the
-- guest-horse picker filters on.
create index horses_guest_recent_idx
  on horses (created_by, last_used_at desc)
  where is_guest = true;

-- 031_rider_admin_fields.sql
--
-- Two new free-text fields on rider_profiles that the admin dashboard
-- "edit drawer" writes:
--
--  - admin_notes  — private to admin. Things Ferdinand wants to remember
--                   about a rider (e.g. "preferred horse is Apollo, prefers
--                   30-min sessions, contact via WhatsApp"). Never shown
--                   to the rider.
--
--  - next_focus   — a short message the rider sees as a banner on /home
--                   ("Please record a lunging session this week"). Lets
--                   the admin steer what data each rider contributes
--                   without sending out-of-band messages.
--
-- Both nullable; both default null. No length cap at the DB level — the
-- API enforces a 500-char limit so we don't accidentally let a paste of
-- War and Peace through.
--
-- RLS: the existing self-read policy on rider_profiles already covers
-- rider reading their own next_focus. The existing admin write policy
-- (026) already covers admin writing both columns.

alter table rider_profiles
  add column admin_notes text,
  add column next_focus text;

comment on column rider_profiles.admin_notes is
  'Private admin-only notes about this rider. Not visible to the rider.';

comment on column rider_profiles.next_focus is
  'Short message from admin shown to rider on /home (e.g. "record a lunging session this week").';

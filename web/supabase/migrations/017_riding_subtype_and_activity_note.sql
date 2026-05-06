-- Slice 11.8: granularity for riding/lunging + free-text label for "other".
-- Adds two nullable columns + extends activity_type CHECK with 'lunging'.
-- Cross-field invariants enforced via CHECK constraints (no triggers).

alter table sessions drop constraint if exists sessions_activity_type_check;

alter table sessions
  add column riding_subtype text,
  add column activity_note text;

alter table sessions
  add constraint sessions_activity_type_check check (
    activity_type in ('riding','lunging','grass_field','walker','stall','transport','vet','other')
  );

alter table sessions
  add constraint sessions_riding_subtype_check check (
    riding_subtype is null
    or (
      activity_type in ('riding','lunging')
      and riding_subtype in ('flat_work','light_jumping','heavy_jumping','cross_country','hack','other')
    )
  );

alter table sessions
  add constraint sessions_activity_note_check check (
    activity_note is null
    or (activity_type = 'other' and char_length(activity_note) <= 200)
  );

comment on column sessions.riding_subtype is
  'Slice 11.8: granularity tag for riding and lunging only. NULL for all other activity types.';
comment on column sessions.activity_note is
  'Slice 11.8: free-text label for activity_type=other. Max 200 chars. NULL for all other activity types.';

-- 013_label_corrections.sql — rider corrections become ground-truth pairs.
-- Spec source: docs/shared/11-correction-tracking.md.
-- Slice 15 wires the review UI; this slice only creates the table so the
-- ground-truth pipeline (auto label + correction) can be modelled end-to-end.

create table label_corrections (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references sessions(id) on delete cascade,
  auto_start_ms         bigint not null,
  auto_end_ms           bigint not null,
  auto_label_type       text not null,
  auto_confidence       real,
  corrected_start_ms    bigint,
  corrected_end_ms      bigint,
  corrected_label_type  text,
  correction_kind       text not null
                          check (correction_kind in
                            ('approved','relabelled','retimed','deleted','split','merged')),
  rider_id              uuid references rider_profiles(id),
  algo_version          text not null,
  created_at            timestamptz default now()
);

create index label_corrections_session_idx on label_corrections(session_id);
create index label_corrections_kind_idx on label_corrections(correction_kind);

comment on table label_corrections is
  'Rider corrections paired with auto labels (ground truth for classifier). Slice 15 wires the UI.';

alter table label_corrections enable row level security;

create policy "riders read own session corrections"
  on label_corrections for select
  using (
    exists (select 1 from sessions
            where sessions.id = label_corrections.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

create policy "riders insert own session corrections"
  on label_corrections for insert
  with check (
    exists (select 1 from sessions
            where sessions.id = label_corrections.session_id
              and sessions.rider_id = auth.uid()
              and sessions.status = 'completed')
  );

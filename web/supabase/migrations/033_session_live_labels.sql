-- 033_session_live_labels.sql — rider taps gait chips during the ride; each
-- tap writes a point-in-time ground-truth label. Independent of the
-- post-session label_corrections review (which is block-shaped). The live
-- channel is the gold-standard ground truth: exact timestamp, no memory loss.

create table session_live_labels (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  rider_id        uuid not null references rider_profiles(id),
  t_ms            bigint not null check (t_ms >= 0),
  label           text not null check (label in ('halt','walk','trot','canter','jump')),
  created_at      timestamptz default now()
);
create index session_live_labels_session_idx on session_live_labels(session_id, t_ms);

comment on table session_live_labels is 'Rider-tapped live gait labels during recording. Point-in-time ground truth, distinct from post-session block review (label_corrections).';

alter table session_live_labels enable row level security;

-- Insert: only the session's rider, only while the session is active.
create policy "riders insert own live labels"
  on session_live_labels for insert
  with check (
    rider_id = auth.uid()
    and exists (select 1 from sessions
                where sessions.id = session_live_labels.session_id
                  and sessions.rider_id = auth.uid()
                  and sessions.status = 'active')
  );

-- Read: rider sees own session's labels; admin sees all.
create policy "riders read own live labels"
  on session_live_labels for select
  using (
    exists (select 1 from sessions
            where sessions.id = session_live_labels.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

-- Delete: rider can clean up an accidental tap on own active session.
create policy "riders delete own live labels"
  on session_live_labels for delete
  using (
    rider_id = auth.uid()
    and exists (select 1 from sessions
                where sessions.id = session_live_labels.session_id
                  and sessions.rider_id = auth.uid()
                  and sessions.status = 'active')
  );

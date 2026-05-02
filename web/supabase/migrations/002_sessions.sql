-- 002_sessions.sql — sessions + raw sample streams
-- activity_type CHECK list MUST stay in sync with web/lib/activities.ts

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  horse_id        uuid not null references horses(id),
  rider_id        uuid not null references rider_profiles(id),
  band_id         uuid references bands(id),
  activity_type   text not null check (activity_type in
                    ('riding','grass_field','walker','stall','transport','vet','other')),
  start_time      timestamptz not null,
  end_time        timestamptz,
  status          text default 'active' check (status in
                    ('active','completed','abandoned','approved')),
  metrics_status  text default 'pending' check (metrics_status in
                    ('pending','computing','complete','failed')),
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

comment on table sessions is 'One row per logged session; the central join point';
comment on column sessions.status is 'active=ongoing, completed=ended, abandoned=killed without end_time, approved=rider confirmed labels';
comment on column sessions.metrics_status is 'lifecycle of algo compute for this session';

create index sessions_horse_idx on sessions(horse_id, start_time desc);
create index sessions_rider_idx on sessions(rider_id, start_time desc);
create index sessions_active_idx on sessions(status) where status = 'active';

create table samples_hr (
  id              bigserial primary key,
  session_id      uuid not null references sessions(id) on delete cascade,
  timestamp_ms    bigint not null,
  hr_bpm          int,
  rr_ms           int,
  contact         boolean
);
create index samples_hr_session_idx on samples_hr(session_id, timestamp_ms);

create table samples_acc (
  id              bigserial primary key,
  session_id      uuid not null references sessions(id) on delete cascade,
  timestamp_ms    bigint not null,
  ax              real,
  ay              real,
  az              real
);
create index samples_acc_session_idx on samples_acc(session_id, timestamp_ms);

create table samples_ecg (
  id              bigserial primary key,
  session_id      uuid not null references sessions(id) on delete cascade,
  timestamp_ms    bigint not null,
  ecg_uv          int
);
create index samples_ecg_session_idx on samples_ecg(session_id, timestamp_ms);

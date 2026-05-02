-- 003_metrics_and_labels.sql — gait labels + per-session computed metrics

create table labels (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  start_ms        bigint not null,
  end_ms          bigint not null,
  label_type      text not null check (label_type in
                    ('walk','trot','canter_gallop','jump','rest','other')),
  jump_count      int,
  confidence      real,
  source          text default 'auto' check (source in
                    ('auto','manual','corrected')),
  created_at      timestamptz default now()
);

comment on table labels is 'Gait segments within a riding session';
comment on column labels.start_ms is 'Relative to session start, not absolute UTC';
comment on column labels.source is 'auto=algo wrote it, corrected=rider edited an auto, manual=rider added by hand';

create index labels_session_idx on labels(session_id, start_ms);

create table session_metrics (
  session_id      uuid primary key references sessions(id) on delete cascade,
  duration_s      int,
  hr_avg          real,
  hr_peak         int,
  hr_min          int,
  hr_sd           real,
  rmssd_ms        real,
  sdnn_ms         real,
  pnn50_pct       real,
  trimp_banister  real,
  recovery_tau_s  real,
  time_walk_s     int,
  time_trot_s     int,
  time_canter_s   int,
  time_gallop_s   int,
  time_rest_s     int,
  jump_count      int,
  computed_at     timestamptz default now(),
  algo_version    text
);

comment on table session_metrics is 'One row per session, written by algo service after compute';
comment on column session_metrics.algo_version is 'Track which algo version produced these metrics';

-- 007_anomaly_flags.sql — anomaly flags emitted by algo (see docs/algorithms/08-anomaly-rest.md)

create table anomaly_flags (
  id                uuid primary key default gen_random_uuid(),
  horse_id          uuid references horses(id),
  session_id        uuid references sessions(id),
  metric            text not null,
  severity          text not null,
  observed          real,
  baseline_mean     real,
  baseline_sd       real,
  z_score           real,
  suggested_action  text,
  created_at        timestamptz default now(),
  acknowledged_at   timestamptz,
  acknowledged_by   uuid references rider_profiles(id)
);

comment on table anomaly_flags is 'Per-horse z-score anomalies emitted by the rest-context anomaly detector; admins acknowledge via Today screen';

create index anomaly_flags_horse_idx on anomaly_flags(horse_id, created_at desc);
create index anomaly_flags_unack_idx on anomaly_flags(acknowledged_at) where acknowledged_at is null;

alter table anomaly_flags enable row level security;

create policy "riders read own horse anomaly flags"
  on anomaly_flags for select
  using (
    exists (select 1 from horse_riders
            where horse_riders.horse_id = anomaly_flags.horse_id
              and horse_riders.rider_id = auth.uid())
    or is_admin_check()
  );

create policy "admins acknowledge anomaly flags"
  on anomaly_flags for update
  using (is_admin_check())
  with check (is_admin_check());

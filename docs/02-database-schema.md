# 02 · Database Schema

## Overview

Supabase Postgres. **Row-level security (RLS) enabled** on all rider-facing tables — required because each rider sees only their own data. Migrations live in `lafattoria-web/supabase/migrations/`. Algo service uses the service-role key, bypassing RLS for compute work.

## Schema (full SQL)

### 001_init.sql

```sql
-- =============================================================
-- HORSES
-- =============================================================
create table horses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  breed           text,
  date_of_birth   date,
  sex             text check (sex in ('mare','gelding','stallion')),
  owner           text,
  photo_url       text,
  notes           text,
  stable_id       uuid,
  created_at      timestamptz default now(),
  created_by      uuid references auth.users(id)
);

comment on table horses is 'One row per horse in the study';
comment on column horses.stable_id is 'Optional grouping for multi-stable deployments; V.0 stable management UI ships in V.2';

-- =============================================================
-- RIDER PROFILES (Supabase auth.users + extra fields)
-- =============================================================
create table rider_profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null,
  is_admin            boolean default false,
  preferred_horse_id  uuid references horses(id),
  total_sessions      int default 0,
  consented_at        timestamptz,
  created_at          timestamptz default now()
);

comment on table rider_profiles is 'Extends auth.users with rider-specific fields';
comment on column rider_profiles.consented_at is 'IRB hedge: timestamp the rider ticked the consent checkbox at magic-link sign-up (Slice 3)';

-- =============================================================
-- HORSE-RIDER PERMISSIONS
-- =============================================================
create table horse_riders (
  horse_id        uuid references horses(id) on delete cascade,
  rider_id        uuid references rider_profiles(id) on delete cascade,
  role            text not null check (role in ('rider','trainer','owner')),
  granted_at      timestamptz default now(),
  granted_by      uuid references rider_profiles(id),
  primary key (horse_id, rider_id)
);

comment on table horse_riders is 'Which riders can log sessions for which horses';

-- =============================================================
-- BANDS
-- =============================================================
create table bands (
  id              uuid primary key default gen_random_uuid(),
  mac_address     text unique not null,
  model           text default 'Polar H10',
  nickname        text,
  paired_at       timestamptz default now(),
  last_seen       timestamptz,
  paired_by       uuid references rider_profiles(id)
);

comment on table bands is 'Polar H10 / Equine bands seen by the system';
```

### 002_sessions.sql

```sql
-- =============================================================
-- SESSIONS — the central table
-- =============================================================
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

-- =============================================================
-- SAMPLES (raw, written by ingest)
-- =============================================================
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
  ax              real, ay real, az real
);
create index samples_acc_session_idx on samples_acc(session_id, timestamp_ms);

create table samples_ecg (
  id              bigserial primary key,
  session_id      uuid not null references sessions(id) on delete cascade,
  timestamp_ms    bigint not null,
  ecg_uv          int
);
create index samples_ecg_session_idx on samples_ecg(session_id, timestamp_ms);
```

### 003_metrics_and_labels.sql

```sql
-- =============================================================
-- LABELS (gait segments within a session)
-- =============================================================
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

-- =============================================================
-- SESSION METRICS (computed by algo, one row per session)
-- =============================================================
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
```

### 004_horse_daily.sql

```sql
-- =============================================================
-- HORSE DAILY (rolling aggregates for trends)
-- =============================================================
create table horse_daily (
  horse_id        uuid references horses(id) on delete cascade,
  date            date,
  session_count   int default 0,
  total_workload  real default 0,
  total_active_s  int default 0,
  resting_hr_med  real,
  rmssd_med       real,
  primary key (horse_id, date)
);

comment on table horse_daily is 'Per-horse per-day aggregates, refreshed daily by Supabase cron';
```

### 005_rls_policies.sql

```sql
-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table horses enable row level security;
alter table rider_profiles enable row level security;
alter table horse_riders enable row level security;
alter table bands enable row level security;
alter table sessions enable row level security;
alter table samples_hr enable row level security;
alter table samples_acc enable row level security;
alter table samples_ecg enable row level security;
alter table labels enable row level security;
alter table session_metrics enable row level security;

-- Riders see their own profile
create policy "riders see own profile"
  on rider_profiles for select
  using (id = auth.uid() or is_admin_check());

-- Riders see horses they have permission to ride
create policy "riders see authorized horses"
  on horses for select
  using (
    exists (select 1 from horse_riders
            where horse_id = horses.id and rider_id = auth.uid())
    or is_admin_check()
  );

-- Riders see their own sessions
create policy "riders see own sessions"
  on sessions for select
  using (rider_id = auth.uid() or is_admin_check());

-- Riders insert sessions for horses they can ride
create policy "riders create authorized sessions"
  on sessions for insert
  with check (
    rider_id = auth.uid()
    and exists (select 1 from horse_riders
                where horse_id = sessions.horse_id and rider_id = auth.uid())
  );

-- CRITICAL: explicit policies on samples_* tables (otherwise RLS blocks all I/O)
-- Riders INSERT samples for own active sessions
create policy "riders insert hr samples"
  on samples_hr for insert
  with check (
    exists (
      select 1 from sessions
      where sessions.id = samples_hr.session_id
        and sessions.rider_id = auth.uid()
        and sessions.status = 'active'
    )
  );
-- (repeat the same INSERT policy on samples_acc and samples_ecg)

-- Riders SELECT samples for own sessions (any status); admin sees all
create policy "riders read hr samples"
  on samples_hr for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = samples_hr.session_id
        and (sessions.rider_id = auth.uid() or is_admin_check())
    )
  );
-- (repeat the same SELECT policy on samples_acc and samples_ecg)

-- Helper function
create or replace function is_admin_check() returns boolean as $$
  select coalesce((select is_admin from rider_profiles where id = auth.uid()), false)
$$ language sql stable security definer;

-- Service role (algo) bypasses RLS automatically
```

### 008_compute_jobs.sql, 009_idempotency.sql, 010_session_last_ingest.sql

V.0.1 hardening migrations — see `shared/09-v0-1-hardening.md` for full SQL and rationale. Brief summary:

- **008_compute_jobs.sql** — `compute_jobs` table for retryable algo invocations, replaces fire-and-forget HTTP
- **009_idempotency.sql** — adds `client_session_id` UUID column on `sessions` + unique partial indexes preventing double-Start and two-active-sessions-per-horse
- **010_session_last_ingest.sql** — adds `last_ingest_at` column on `sessions` so cron can auto-abandon stale active sessions

## Sample volume estimates

| Stream | Rate | Per 50-min session | DB size |
|---|---|---|---|
| HR / R-R | ~2 Hz | ~6,000 rows | ~1 MB |
| Accelerometer | 25 Hz | ~75,000 rows | ~10 MB |
| Raw ECG | 130 Hz | ~390,000 rows | ~30 MB |

V.0 storage budget: comfortable for 6 months on Supabase Pro (500 GB plan). If exceeded, migrate raw ECG to Supabase Storage as Parquet, retain features in Postgres.

## Migration workflow

```
lafattoria-web/supabase/migrations/
  001_init.sql
  002_sessions.sql
  003_metrics_and_labels.sql
  004_horse_daily.sql
  005_rls_policies.sql
  006_seed.sql                    ← idempotent seed data
  007_anomaly_flags.sql           ← anomaly_flags table (see algorithms/08)
  008_compute_jobs.sql            ← V.0.1 hardening (see shared/09)
  009_idempotency.sql             ← V.0.1 hardening
  010_session_last_ingest.sql     ← V.0.1 hardening
  011_label_corrections.sql       ← rider correction tracking (see shared/11)
```

Apply via Supabase CLI: `supabase db push`. Never edit a migration after it's been applied — always create a new numbered one.

## Seed data

```sql
-- 006_seed.sql
insert into horses (name, breed, sex) values
  ('Hippo',   'KWPN',          'gelding'),
  ('Venus',   'Holsteiner',    'mare'),
  ('Titan',   'Selle Français','gelding')
on conflict do nothing;
```

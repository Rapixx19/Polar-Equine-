-- 001_init.sql — base reference tables
-- horses, rider_profiles, horse_riders, bands

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

create table horse_riders (
  horse_id        uuid references horses(id) on delete cascade,
  rider_id        uuid references rider_profiles(id) on delete cascade,
  role            text not null check (role in ('rider','trainer','owner')),
  granted_at      timestamptz default now(),
  granted_by      uuid references rider_profiles(id),
  primary key (horse_id, rider_id)
);

comment on table horse_riders is 'Which riders can log sessions for which horses';

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

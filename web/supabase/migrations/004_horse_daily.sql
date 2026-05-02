-- 004_horse_daily.sql — rolling per-horse per-day aggregates

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

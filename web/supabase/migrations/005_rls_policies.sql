-- 005_rls_policies.sql — RLS enable + policies for rider-facing tables
-- Helper function created FIRST so the policies below can reference it.
-- Service role (algo) bypasses RLS automatically.

create or replace function is_admin_check() returns boolean as $$
  select coalesce((select is_admin from rider_profiles where id = auth.uid()), false)
$$ language sql stable security definer;

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

create policy "riders see own profile"
  on rider_profiles for select
  using (id = auth.uid() or is_admin_check());

create policy "riders see authorized horses"
  on horses for select
  using (
    exists (select 1 from horse_riders
            where horse_id = horses.id and rider_id = auth.uid())
    or is_admin_check()
  );

create policy "riders see own sessions"
  on sessions for select
  using (rider_id = auth.uid() or is_admin_check());

create policy "riders create authorized sessions"
  on sessions for insert
  with check (
    rider_id = auth.uid()
    and exists (select 1 from horse_riders
                where horse_id = sessions.horse_id and rider_id = auth.uid())
  );

create policy "riders insert hr samples"
  on samples_hr for insert
  with check (
    exists (select 1 from sessions
            where sessions.id = samples_hr.session_id
              and sessions.rider_id = auth.uid()
              and sessions.status = 'active')
  );
create policy "riders read hr samples"
  on samples_hr for select
  using (
    exists (select 1 from sessions
            where sessions.id = samples_hr.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

create policy "riders insert acc samples"
  on samples_acc for insert
  with check (
    exists (select 1 from sessions
            where sessions.id = samples_acc.session_id
              and sessions.rider_id = auth.uid()
              and sessions.status = 'active')
  );
create policy "riders read acc samples"
  on samples_acc for select
  using (
    exists (select 1 from sessions
            where sessions.id = samples_acc.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

create policy "riders insert ecg samples"
  on samples_ecg for insert
  with check (
    exists (select 1 from sessions
            where sessions.id = samples_ecg.session_id
              and sessions.rider_id = auth.uid()
              and sessions.status = 'active')
  );
create policy "riders read ecg samples"
  on samples_ecg for select
  using (
    exists (select 1 from sessions
            where sessions.id = samples_ecg.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

create policy "riders read own session labels"
  on labels for select
  using (
    exists (select 1 from sessions
            where sessions.id = labels.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

create policy "riders read own session metrics"
  on session_metrics for select
  using (
    exists (select 1 from sessions
            where sessions.id = session_metrics.session_id
              and (sessions.rider_id = auth.uid() or is_admin_check()))
  );

create policy "riders read own horse_riders rows"
  on horse_riders for select
  using (rider_id = auth.uid() or is_admin_check());

create policy "admins read bands"
  on bands for select
  using (is_admin_check());

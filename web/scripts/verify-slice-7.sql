-- Slice 7 verification query — run after a 5-minute smoke session.
--
-- Patched from docs/05-build-plan.md:200-212. Two spec bugs fixed:
--   1. Column was `t_ms` in the spec; the actual samples_hr column is `timestamp_ms`
--      (slice 6's ingest route maps the wire `t_ms` field to `timestamp_ms`).
--   2. Aggregate functions can't directly wrap a window function in Postgres;
--      the lag() must live in a subquery before max() consumes it.
--
-- Expected after a passing smoke run:
--   session_ok=1, sample_count>=250, hr_min>=30, hr_max<=220,
--   max_gap_ms<=5000, consent_ok>=1
--
-- TODO (post-slice-7): patch docs/05-build-plan.md:200-212 to match.

with s as (
  select id from sessions order by created_at desc limit 1
),
gaps as (
  select max(gap_ms) as max_gap_ms from (
    select timestamp_ms - lag(timestamp_ms) over (order by timestamp_ms) as gap_ms
    from samples_hr where session_id = (select id from s)
  ) g
)
select
  (select count(*) from sessions
     where id = (select id from s) and status='completed' and end_time is not null) as session_ok,
  (select count(*) from samples_hr where session_id = (select id from s)) as sample_count,
  (select min(hr_bpm) from samples_hr where session_id = (select id from s)) as hr_min,
  (select max(hr_bpm) from samples_hr where session_id = (select id from s)) as hr_max,
  (select max_gap_ms from gaps) as max_gap_ms,
  (select count(*) from rider_profiles where consented_at is not null) as consent_ok;

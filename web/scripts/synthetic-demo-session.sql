-- Seeds a synthetic 30-minute session on the "Demo Horse (synthetic)" horse
-- for the rapixx19 admin account so the /admin/sessions/[id] page (including
-- the Claude insight button) can be exercised without a real H10 ride.
--
-- Convention: samples_hr.timestamp_ms and label_corrections.auto_*_ms are
-- session-start-RELATIVE milliseconds (0 = session start). The first version
-- of this script wrote epoch ms into samples_hr and the HR chart's x-axis
-- exploded to ~29.6M minutes — keep the cast/normalisation below intact.
--
-- Idempotent-ish: re-running creates an additional session. Delete the old
-- one manually if you want a clean slate.

do $$
declare
  v_rider_id   uuid := 'aae176f9-fdc9-4af8-8ade-f824b00e36a9';  -- rapixx19
  v_horse_id   uuid := '1319f300-8b80-43a2-b789-7d4d9813f9f7';  -- Demo Horse (synthetic)
  v_session_id uuid := gen_random_uuid();
  v_start      timestamptz := now() - interval '30 minutes';
  v_end        timestamptz := now();
  v_duration_ms bigint := 30 * 60 * 1000;
  i int;
  v_t_ms bigint;
  v_phase text;
  v_hr int;
  v_t_frac numeric;
begin
  insert into sessions (
    id, rider_id, horse_id, activity_type, start_time, end_time,
    status, metrics_status, created_at, updated_at
  ) values (
    v_session_id, v_rider_id, v_horse_id, 'riding', v_start, v_end,
    'ended', 'complete', v_start, v_end
  );

  -- 1 Hz HR samples shaped as walk → trot → canter → cool-down.
  -- t_ms is RELATIVE to session start (0..1,799,000).
  for i in 0..1799 loop
    v_t_ms := i * 1000;
    if v_t_ms < 5 * 60 * 1000 then            -- 0..5 min walk
      v_phase := 'walk';
      v_t_frac := v_t_ms::numeric / (5 * 60 * 1000);
      v_hr := round(65 + v_t_frac * 35);
    elsif v_t_ms < 15 * 60 * 1000 then        -- 5..15 min trot
      v_phase := 'trot';
      v_t_frac := (v_t_ms - 5 * 60 * 1000)::numeric / (10 * 60 * 1000);
      v_hr := round(100 + v_t_frac * 35);
    elsif v_t_ms < 25 * 60 * 1000 then        -- 15..25 min canter
      v_phase := 'canter';
      v_t_frac := (v_t_ms - 15 * 60 * 1000)::numeric / (10 * 60 * 1000);
      v_hr := round(135 + v_t_frac * 40);
    else                                       -- 25..30 min cool-down
      v_phase := 'walk';
      v_t_frac := (v_t_ms - 25 * 60 * 1000)::numeric / (5 * 60 * 1000);
      v_hr := round(155 - v_t_frac * 55);
    end if;
    -- mild wobble to look organic
    v_hr := v_hr + ((i * 37) % 7) - 3;

    insert into samples_hr (session_id, timestamp_ms, hr_bpm, rr_ms, contact)
    values (v_session_id, v_t_ms, v_hr, round(60000.0 / v_hr)::int, true);
  end loop;

  insert into session_metrics (
    session_id, hr_avg, hr_peak, hr_min, rmssd_ms, sdnn_ms, pnn50_pct,
    trimp_banister, recovery_tau_s, jump_count, computed_at, algo_version
  ) values (
    v_session_id, 128, 178, 62, 32.0, 48.0, 9.5, 98.0, 142, 0, now(), 'synthetic-0.1'
  );

  insert into label_corrections (session_id, auto_start_ms, auto_end_ms, auto_label_type, correction_kind, algo_version, created_at)
  values
    (v_session_id, 0,        300000,  'walk',   'approved', 'synthetic-0.1', now()),
    (v_session_id, 300000,   900000,  'trot',   'approved', 'synthetic-0.1', now()),
    (v_session_id, 900000,   1500000, 'canter', 'approved', 'synthetic-0.1', now()),
    (v_session_id, 1500000,  1800000, 'walk',   'approved', 'synthetic-0.1', now());

  raise notice 'Seeded synthetic session %', v_session_id;
end $$;

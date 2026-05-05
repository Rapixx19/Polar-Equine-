-- 016_session_metrics_workload_recovery.sql — Slice 11 + 11.5 schema
--
-- Spec sources:
--   docs/algorithms/05-trimp-zones.md      (TRIMP + 5-zone times)
--   docs/algorithms/04-recovery-tau.md     (recovery τ + fit quality)
--   docs/algorithms/07-session-metrics.md  (orchestration)
--
-- All columns nullable: a session that fails recovery τ fitting still gets
-- a row with workload metrics + NULL recovery columns (and vice versa).
-- Recovery τ is intentionally three-state — see recovery_fit_quality comment.

alter table session_metrics
  -- Slice 11 — workload (TRIMP + 5-zone times)
  add column time_z1_s            integer,  -- 50-60% HRmax (HRmax=225 default V.0)
  add column time_z2_s            integer,  -- 60-70%
  add column time_z3_s            integer,  -- 70-80%
  add column time_z4_s            integer,  -- 80-90%
  add column time_z5_s            integer,  -- 90-100%+
  add column avg_hr_pct           real,     -- mean(filtered hr_bpm) / HRmax
  add column workload_quality     real,     -- fraction of HR in [30,220] bpm
  -- Slice 11.5 — recovery τ
  add column recovery_fit_quality real;     -- R² of exp-decay fit; see comment

comment on column session_metrics.time_z1_s is
  'Slice 11: seconds in HR Zone 1 (50-60% HRmax). HRmax=225 default for V.0; per-horse calibration deferred to V.1.';
comment on column session_metrics.time_z2_s is
  'Slice 11: seconds in HR Zone 2 (60-70% HRmax).';
comment on column session_metrics.time_z3_s is
  'Slice 11: seconds in HR Zone 3 (70-80% HRmax).';
comment on column session_metrics.time_z4_s is
  'Slice 11: seconds in HR Zone 4 (80-90% HRmax).';
comment on column session_metrics.time_z5_s is
  'Slice 11: seconds in HR Zone 5 (≥90% HRmax). Open-ended — HR > HRmax also counted here.';
comment on column session_metrics.avg_hr_pct is
  'Slice 11: mean(filtered hr_bpm) / HR_max. Range ~[0, 1+]; >1 indicates HR briefly exceeded the species default HRmax.';
comment on column session_metrics.workload_quality is
  'Slice 11: fraction of HR samples within physiological bounds [30,220] bpm. INPUT-SIDE cleanliness — distinct from recovery_fit_quality.';
comment on column session_metrics.recovery_fit_quality is
  'Slice 11.5: three-state R² of the exponential decay fit. NULL = not attempted (rest_* session); 0.0 = attempted but no usable decay (no peak / dropout / fit failed); (0.0, 1.0] = R² of fit. OUTPUT-SIDE model fit — distinct from workload_quality.';

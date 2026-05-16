-- 038_horse_hr_calibration.sql — per-horse HR_max + HR_rest for zone scoring.
--
-- Why: V.0 species defaults are HR_max=225, HR_rest=32 (algorithms/trimp_zones.py
-- :13-15, :45-46). Those numbers are thoroughbred-sprint values; most sport
-- horses cap ~150-200. On Emma's horse the avg ride HR is ~84 with peak ~99
-- and trot ~90 — observed values that put the horse's true HR_max around 130-
-- 150. With the 225 default, the Z1 floor (50% × 225 = 112.5 bpm) sits above
-- the horse's working HR, so every zone time landed at 0 even though TRIMP
-- correctly recorded the work via the continuous Banister formula.
--
-- This migration adds two nullable integer columns on `horses` so the algo
-- can read a per-horse override and fall back to species defaults when NULL.
-- Calibration ride day-2 sets these from observed peak/rest values; admin UI
-- editing arrives later. For now the values are set directly in Studio.
--
-- Bounds (CHECK constraints) reflect equine physiology rather than data-
-- entry guarantees: HR_max in [100, 260], HR_rest in [20, 80]. Anything
-- outside is almost certainly a typo. Nullable so unset horses keep using
-- the V.0 species defaults.

alter table horses
  add column if not exists hr_max_bpm  int check (hr_max_bpm  between 100 and 260),
  add column if not exists hr_rest_bpm int check (hr_rest_bpm between 20  and 80);

comment on column horses.hr_max_bpm is
  'Per-horse HR ceiling for TRIMP + 5-zone scoring. NULL falls back to algo species default (225). Set from a max-effort calibration ride.';

comment on column horses.hr_rest_bpm is
  'Per-horse HR floor for TRIMP %HRr calculation. NULL falls back to algo species default (32). Typical equine resting HR is 28-44 bpm.';

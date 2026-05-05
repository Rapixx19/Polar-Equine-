-- 014_session_metrics_quality.sql — quality + pnn20 columns for Slice 10
-- Spec source: docs/algorithms/02-rr-cleaning.md (quality formula);
-- Slice 10 plan v2.1 (this migration is the schema half of "FIRST COMPUTE").
--
-- Three columns:
--   - rr_cleaning_quality       — surfaced by algo /compute since Slice 9 but
--                                 had no place to land.
--   - hrv_completeness_quality  — same.
--   - pnn20_pct                 — algo computes pNN20 since Slice 9 but the
--                                 003 schema only listed pNN50. Adding here so
--                                 strict-insert from /compute lands cleanly.

alter table session_metrics
  add column rr_cleaning_quality      real,
  add column hrv_completeness_quality real,
  add column pnn20_pct                real;

comment on column session_metrics.rr_cleaning_quality is
  'Slice 10: max(0, 1 - n_corrected/n_total) from rr_cleaning.clean. 1.0 = pristine, 0.0 = every beat touched.';
comment on column session_metrics.hrv_completeness_quality is
  'Slice 10: min(1.0, n_clean_beats/60). Below 1.0 means the input was shorter than the Task Force short-term window.';
comment on column session_metrics.pnn20_pct is
  'Slice 10 backfill: pct of |dRR| > 20 ms. More sensitive than pNN50 for low-HR resting horses.';

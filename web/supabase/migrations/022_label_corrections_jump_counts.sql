-- 022_label_corrections_jump_counts.sql — extend label_corrections for Slice 15.A.
--
-- Slice 15.A ships a label review UI where the v0.1 HR-threshold classifier
-- (algo_version='hr-threshold-v0.1') produces auto-labels and the rider approves
-- or relabels each segment. correction_kind reuses 'approved'/'relabelled' from
-- migration 013, so no enum change is needed.
--
-- What this migration adds: per-block jump counts. The classifier cannot emit
-- jumps yet (no ACC/impulse data — H10-only campaign), so auto_jump_count
-- defaults to 0 and corrected_jump_count carries the rider's number. When Slice
-- 13 lands an impulse detector, auto_jump_count starts getting real values.

alter table label_corrections
  add column corrected_jump_count int not null default 0,
  add column auto_jump_count      int not null default 0;

comment on column label_corrections.corrected_jump_count is
  'Per-block jump count entered by the rider. 0 if no jumps occurred in this block.';
comment on column label_corrections.auto_jump_count is
  'Per-block jump count produced by the impulse detector (Slice 13). 0 for HR-only classifier rows.';

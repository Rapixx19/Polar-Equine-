-- 034_live_labels_v2.sql — rework the live-label taxonomy after first field
-- review: riders track {warm_up, walk, trot, gallop, jump}. Jump rows carry a
-- count (1..20) for combinations. `halt` retires into `warm_up`; `canter`
-- folds into `gallop` because the H10 girth-strap classifier already bundles
-- them and riders rarely distinguish 3-beat vs 4-beat in-saddle.

-- 1. Drop the old CHECK so we can remap values.
alter table session_live_labels drop constraint session_live_labels_label_check;

-- 2. Remap existing rows.
update session_live_labels set label = 'warm_up' where label = 'halt';
update session_live_labels set label = 'gallop' where label = 'canter';

-- 3. Install the new CHECK.
alter table session_live_labels add constraint session_live_labels_label_check
  check (label in ('warm_up', 'walk', 'trot', 'gallop', 'jump'));

-- 4. Add jump_count (1..20, required iff label='jump').
alter table session_live_labels add column jump_count integer
  check (jump_count is null or (jump_count between 1 and 20));

alter table session_live_labels add constraint session_live_labels_jump_count_shape
  check (
    (label = 'jump' and jump_count is not null)
    or (label <> 'jump' and jump_count is null)
  );

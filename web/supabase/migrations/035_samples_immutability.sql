-- 035_samples_immutability.sql — raw H10 samples are append-only forever
--
-- Why: cleaning happens in-memory at read time inside algo's rr_cleaning.clean();
-- the rows in samples_hr / samples_acc / samples_ecg are historical truth. They
-- must never mutate so that:
--   1. /recompute outputs remain bit-for-bit comparable across algo_version bumps
--   2. Luigi's M0 reproduce-metrics gate stays provable
--   3. Thesis defence can claim "raw signal is never altered after capture"
--
-- What this migration does:
--   - Blocks UPDATE on samples_{hr,acc,ecg} for ALL roles via trigger
--     (incl. service_role, which bypasses RLS — the trigger does not)
--   - DELETE is intentionally NOT blocked at the trigger level so that the
--     existing ON DELETE CASCADE from sessions keeps working. Rider GDPR
--     erasure deletes the whole session and the samples cascade with it; this
--     is the only sanctioned deletion path. Direct DELETE from authenticated/
--     anon is already blocked by the absence of a DELETE policy in
--     005_rls_policies.sql; service_role mustn't issue samples.delete() and
--     no code path does (verified 2026-05-15).
--
-- Escape hatch: if a sample-level correction ever becomes unavoidable, write a
-- dedicated migration that drops + recreates the trigger around the fix, so
-- the mutation is deliberate and auditable in git history.

create or replace function reject_sample_update() returns trigger
language plpgsql
as $$
begin
  raise exception
    'samples are append-only (table %); see migration 035_samples_immutability',
    TG_TABLE_NAME
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function reject_sample_update() is
  'Enforces append-only invariant on raw H10 sample tables. To allow a one-off correction, drop+recreate this trigger inside a dedicated, audited migration.';

create trigger samples_hr_immutable
  before update on samples_hr
  for each row execute function reject_sample_update();

create trigger samples_acc_immutable
  before update on samples_acc
  for each row execute function reject_sample_update();

create trigger samples_ecg_immutable
  before update on samples_ecg
  for each row execute function reject_sample_update();

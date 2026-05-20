-- 037_session_kind_id.sql — persist the rider-facing session-kind chip ID.
--
-- Why: post-session finalize replaces the implicit (activity_type,
-- riding_subtype) pair with seven rider-facing chips (Trot only, Gallop only,
-- Gallop + jumps, Grass feeding, Box standing, Giostra, Transport). Two
-- chips ("trot_only" and "gallop_only") share the same (activity_type,
-- riding_subtype) = (riding, flat_work) tuple, so the chip choice cannot be
-- derived from the existing columns. We need a separate persisted ID.
--
-- The chip taxonomy lives in `web/lib/session-kinds.ts` and is intentionally
-- editable without a migration — the column is plain text rather than an
-- enum so renaming or adding chips doesn't require a schema change. The
-- algo still drives off activity_type + riding_subtype (jump-gate, rest-
-- gate); kind_id is rider-facing metadata only.
--
-- Absence of kind_id (NULL) marks "kind not yet confirmed" and is the
-- trigger for /saved to show the chip picker before dispatching /compute.

alter table sessions
  add column if not exists kind_id text;

comment on column sessions.kind_id is
  'Rider-facing session-kind chip ID (e.g. "trot_only", "gallop_jumps"). NULL = not finalized yet. Taxonomy lives in web/lib/session-kinds.ts.';

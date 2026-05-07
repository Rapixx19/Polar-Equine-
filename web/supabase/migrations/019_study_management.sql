-- 019_study_management.sql
-- Study Management Dashboard (slice 12.A) data model:
--   - per-rider research metadata (yard, joined_week, primary_discipline,
--     weekly_target_override, is_active) on rider_profiles
--   - per-horse research metadata (level, discipline, is_holdout,
--     advisory_weekly_cap_override) on horses
--   - global study settings (single-row) — weekly target, phase length,
--     completion + QC factors, storage capacity, welfare advisories
--   - 9-category allocation targets (A-Walk, A-Trot, A-Canter, A-Gallop,
--     A-Rest, B-Transitions, C-Mixed, D-Jumping, E-Context) with %
--
-- Additive only. New columns are nullable or have safe defaults so existing
-- rows pick them up without breaking. New tables enable RLS with
-- admin-only read+write via the existing is_admin_check() function
-- (added in migration 005).

-- ─── New columns on rider_profiles ───────────────────────────────────────
ALTER TABLE rider_profiles
  ADD COLUMN IF NOT EXISTS yard text,
  ADD COLUMN IF NOT EXISTS joined_week int,
  ADD COLUMN IF NOT EXISTS primary_discipline text
    CHECK (primary_discipline IS NULL OR primary_discipline IN ('sj','dressage','eventing','mixed')),
  ADD COLUMN IF NOT EXISTS weekly_target_override int
    CHECK (weekly_target_override IS NULL OR weekly_target_override > 0),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ─── New columns on horses ───────────────────────────────────────────────
ALTER TABLE horses
  ADD COLUMN IF NOT EXISTS level text
    CHECK (level IS NULL OR level IN ('high-performance','mid-level','returning','young')),
  ADD COLUMN IF NOT EXISTS discipline text
    CHECK (discipline IS NULL OR discipline IN ('sj','dressage','eventing','mixed')),
  ADD COLUMN IF NOT EXISTS is_holdout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advisory_weekly_cap_override int
    CHECK (advisory_weekly_cap_override IS NULL OR advisory_weekly_cap_override > 0);

-- ─── study_settings (single-row global config) ───────────────────────────
CREATE TABLE IF NOT EXISTS study_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weekly_target_per_rider int NOT NULL DEFAULT 4,
  v0_phase_weeks int NOT NULL DEFAULT 16,
  realistic_completion numeric(3,2) NOT NULL DEFAULT 0.80
    CHECK (realistic_completion BETWEEN 0 AND 1),
  realistic_qc_pass numeric(3,2) NOT NULL DEFAULT 0.85
    CHECK (realistic_qc_pass BETWEEN 0 AND 1),
  storage_mb_per_session int NOT NULL DEFAULT 85,
  storage_quota_mb int NOT NULL DEFAULT 8192,
  storage_migration_trigger_pct int NOT NULL DEFAULT 50,
  advisory_sessions_per_horse_per_week int NOT NULL DEFAULT 4,
  advisory_jumping_per_horse_per_week int NOT NULL DEFAULT 2,
  advisory_gallop_per_horse_per_week int NOT NULL DEFAULT 2,
  advisory_min_hours_between int NOT NULL DEFAULT 12,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO study_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── study_allocation_targets (9 rows of session-type allocation) ────────
CREATE TABLE IF NOT EXISTS study_allocation_targets (
  type text PRIMARY KEY,
  sort_order int NOT NULL,
  pct int NOT NULL CHECK (pct BETWEEN 0 AND 100),
  label text NOT NULL,
  color text NOT NULL,
  emphasis text NOT NULL CHECK (emphasis IN ('foundation','state-rich','specialized','core')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO study_allocation_targets (type, sort_order, pct, label, color, emphasis) VALUES
  ('A-Walk',        1,  8, 'Pure walk',         '#7FB069', 'foundation'),
  ('A-Trot',        2, 16, 'Pure trot',         '#7FB069', 'foundation'),
  ('A-Canter',      3, 16, 'Pure canter',       '#7FB069', 'foundation'),
  ('A-Gallop',      4,  6, 'Pure gallop',       '#C45D52', 'state-rich'),
  ('A-Rest',        5,  4, 'Standing rest',     '#7FB069', 'foundation'),
  ('B-Transitions', 6, 12, 'Transitions drill', '#E0A458', 'specialized'),
  ('C-Mixed',       7, 24, 'Mixed real-world',  '#5B9AA0', 'core'),
  ('D-Jumping',     8, 10, 'Jumping',           '#9B6B9E', 'specialized'),
  ('E-Context',     9,  4, 'Context-varied',    '#5B9AA0', 'specialized')
ON CONFLICT (type) DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE study_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_allocation_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY study_settings_admin_read   ON study_settings
  FOR SELECT USING (is_admin_check());
CREATE POLICY study_settings_admin_write  ON study_settings
  FOR ALL    USING (is_admin_check()) WITH CHECK (is_admin_check());
CREATE POLICY study_alloc_admin_read      ON study_allocation_targets
  FOR SELECT USING (is_admin_check());
CREATE POLICY study_alloc_admin_write     ON study_allocation_targets
  FOR ALL    USING (is_admin_check()) WITH CHECK (is_admin_check());

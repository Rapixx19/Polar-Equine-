# Slice 11 — TRIMP + HR zones (~3h25m)

> **Status:** Plan approved 2026-05-05. **Coding gated on Slice 10 merge.** Branch must come off `main` after Phase 3 closure, not off `slice-10-compute-runner`. See "Pre-conditions" below.

## Goal

Per build plan §270-274: **per-session Banister TRIMP + 5-zone time breakdown, written to `session_metrics`.** Closes the workload-summary half of Phase 3+4. Pytest passes; admin UI (Slice 16) will surface the numbers.

This is the first slice of Phase 4 (advanced metrics) — Phase 3 closure (real-H10 row from Slice 10) must happen first.

## Pre-conditions (HARD GATE)

Do **NOT** start coding until all of:

1. **Slice 10 PR #9 merged to `main`.** The branch base for Slice 11 is `main` post-merge, not the slice-10 branch. Reasons:
   - Slice 11 imports from `_pipeline.py` + `data.py` (rewritten in Slice 10). Any post-merge fix to those needs to flow through main first, not through a stacked branch.
   - The Phase 3 → Phase 4 boundary should be a clean main commit, not a chain of stacked PRs.
2. **Phase 3 closure ritual done:** real-H10 capture saved to `proof/slice-10/`, `phase-3-closed` tag pushed, project notes updated.
3. **Algo `/health` returns `algo_version='0.3.0'`** on Railway prod (sanity check that Slice 10 actually shipped).

## State of the world today

- `session_metrics.trimp_banister real` already exists from migration 003 (nullable). No need to add it.
- `time_z1_s..time_z5_s` and `avg_hr_pct` columns do **NOT** exist yet — migration 016 adds them.
- `samples_hr` rows are emitted by Polar H10 at ~1Hz. Each row has `hr_bpm` always; `rr_ms` only when the notification carried at least one RR interval (typical: ~1 per row at rest, fewer per row at high HR because beats are shorter than the 1Hz notification window — wait that's backwards, but the point is `rr_ms` is sometimes NULL).
- `read_hr_samples()` in `algo/service/data.py` filters `rr_ms IS NOT NULL` — that's the right thing for HRV but **wrong for TRIMP**. TRIMP needs every HR sample regardless of RR availability.

## Decisions (locked)

| Decision | Choice | Reason |
|---|---|---|
| A. `avg_hr_pct` column | **Yes, add it.** | Cheap now, painful later. Admin UI (Slice 16) will want it. |
| B. `algo_version` bump | **0.3.0 → 0.4.0.** | Rule 13: new algorithm + new schema fields. Also gives a clean SQL filter "which sessions ran with TRIMP" for free. |
| C. Slice 11 + 11.5 packaging | **Separate PRs.** | TRIMP is closed-form math (low risk); Recovery τ involves curve-fitting on potentially noisy/short post-exercise windows (higher risk). A τ regression must not block TRIMP from reaching admin UI. |
| pandas vs numpy in algo file | **Numpy port.** | Rule 10 (deps justified) + consistency with rest of `algo/algorithms/`. Same math, same return shape. |
| HR sample reader for TRIMP | **New `read_hr_only_samples()`** | Don't touch HRV path. Decouples concerns. |
| Quality-score divergence from spec | **Use `filter_hr_for_stats` bounds [30,220], not raw `hr>0`.** | Internal consistency with HR stats already in pipeline. Note in algo file docstring. |
| `time_below_z1_s` (sub-50% bookkeeping) | **Skip for now. Flag in PR body.** | Spec doesn't ask for it. Below-Z1 isn't training load. If Slice 16 needs it visible, add then — don't engineer ahead of demand. |
| Per-horse HRmax/HRrest | **V.1, not now.** | Hardcode equine defaults 225/32. Document. |

## Spec gaps to flag in PR body

1. Spec uses `pandas.DataFrame`. Algo otherwise pure numpy. Numpy port adopted; spec doc updated to note this.
2. Spec quality formula = `(hr>0).sum()/n`. Implementation uses [30,220] bounds for consistency with HR stats. Both produce a value in [0,1]; ours is more conservative.
3. Zone buckets don't sum to duration when sub-Z1 samples exist. Spec test confirms (`zone_sum <= duration_s`). Documented in column comment + flagged in PR body.
4. Per-horse calibration deferred to V.1 (spec §"Per-horse calibration").
5. **`time_below_z1_s` not added** despite the bookkeeping argument. Explicit choice — flagged so future-you doesn't think it's an oversight.

## Files

### Substantive (≥10 lines of new logic)

1. **`web/supabase/migrations/016_trimp_zones.sql`** (NEW, ~15 lines)
   - `add column time_z1_s integer`, ..., `time_z5_s integer`, `avg_hr_pct real`
   - `comment on column ...` for each (Rule 6)
   - One comment notes "Z1-Z5 use fraction of HRmax (not HRr); sub-50% HR is unbucketed by design"

2. **`algo/algorithms/trimp_zones.py`** (NEW, ≤120 lines)
   - `WorkloadConfig` dataclass: `hr_max_bpm=225`, `hr_rest_bpm=32`, `sex_factor=1.92`
   - `WorkloadResult` dataclass: matches new schema columns
   - `compute(hr_bpm, t_ms, config)` — numpy port of spec
   - Banister: `TRIMP = sum_i [Δt_i(min) * %HRr_i * 0.64 * exp(1.92 * %HRr_i)]`
   - Zones: fraction of HRmax, [0.5,0.6),[0.6,0.7),...,[0.9,1.0]
   - Quality: filtered-HR fraction (not raw `hr>0`)
   - Citations in module docstring (Banister 1991, Calvert 1976, Munsters 2013)

3. **`algo/service/data.py`** (EDIT, +~30 lines)
   - Add `read_hr_only_samples(session_id) -> tuple[NDArray[float64], NDArray[int64]]`
   - Same pagination pattern as `read_hr_samples`. No `rr_ms` filter. Selects only `timestamp_ms,hr_bpm`. Skips rows where `hr_bpm IS NULL`.
   - Existing `read_hr_samples` untouched.

4. **`algo/service/routes/_pipeline.py`** (EDIT, +~20 lines)
   - After HRV write, call `trimp_zones.compute(hr_bpm, t_ms)` using the **unfiltered** HR sample read.
   - Populate new fields on `SessionMetricsRow`. (Strict-insert path means trimp+zones go in the same `INSERT` as HRV — single round-trip to Supabase.)
   - File at risk of crossing 150 lines (currently 86). If it does, extract a `_compose_metrics_row()` helper before crossing 150.

5. **`algo/tests/test_trimp_zones.py`** (NEW, ~80 lines)
   - 3 spec tests verbatim from `docs/algorithms/05-trimp-zones.md:131-153`:
     - `test_zero_workload_at_rest_hr` (TRIMP < 0.5 at HRrest)
     - `test_zone_buckets_sum_to_duration` (≤ duration; documents the gap)
     - `test_higher_hr_produces_higher_trimp` (180bpm > 2.5× 120bpm)
   - 2 edge cases:
     - `test_empty_hr_returns_zeros` (empty input → all zeros, quality=0)
     - `test_dropouts_dont_inflate_trimp` (300 samples with 50 dropouts at hr=0; TRIMP matches a 250-sample baseline within ε)

### Trivial edits

- `algo/service/data_types.py` — add `trimp_banister`, `time_z1_s..z5_s`, `avg_hr_pct` to `SessionMetricsRow`
- `algo/algorithms/version.py` — `algo_version = "0.4.0"`
- `algo/tests/test_health.py` — bump version assertion 0.3.0 → 0.4.0
- `algo/tests/test_compute_endpoint.py` — happy-path now asserts new fields populated; the "synthetic data → low TRIMP" expectation is documented inline
- `algo/tests/test_data_layer.py` — pagination tests for `read_hr_only_samples` mirroring the existing ones (1000-boundary, 999-boundary, multi-page)
- `web/lib/supabase/types.ts` — regenerated post-016, committed in same PR

## Step-by-step

| # | What | Est |
|---|---|---|
| **0a** | **Verify Slice 10 merged to main + Phase 3 closure ritual complete.** If not, stop. | 5m |
| 0b | Branch `slice-11-trimp-zones` off main. Confirm `algo_version` on Railway prod = 0.3.0. | 5m |
| 1 | Save the **pre-recompute v0.3.0 row** for the synthetic Slice 10 session to `proof/slice-11/pre-recompute-row.json` BEFORE any code change. (Cheap insurance against losing the side-by-side comparison.) | 5m |
| 2 | Migration 016 + apply via Supabase MCP + regen `lib/supabase/types.ts`. CI typecheck green. | 15m |
| 3 | Write `algo/algorithms/trimp_zones.py` (numpy port). | 45m |
| 4 | Write `algo/tests/test_trimp_zones.py` (3 spec + 2 edge). `pytest -q` green. | 30m |
| 5 | Add `read_hr_only_samples` to `service/data.py` + pagination tests in `test_data_layer.py`. | 25m |
| 6 | Wire into `_pipeline.py`. Update `data_types.py` + `data.py write_session_metrics` payload. Bump version 0.4.0. | 25m |
| 7 | Update `test_compute_endpoint.py` happy-path assertion + `test_health.py` version. | 15m |
| 8 | Algo gates: `mypy --strict .`, `ruff check .`, `pytest -q`. Fix reds. | 15m |
| 9 | Push branch → Railway auto-deploys. `curl /health` → `algo_version=0.4.0`. | 10m |
| 10 | **Synthetic recompute smoke** (with documented caveat): `curl /recompute { session_id: "a3f6e541-…" }` → query session_metrics → trimp+zones present, algo_version=0.4.0. **Save result row to `proof/slice-11/post-recompute-synthetic-row.json`.** Note in artefact that flat-Z1 distribution is expected from the synthetic data, not a bug. | 25m |
| 11 | Doc: short addendum to `docs/algorithms/05-trimp-zones.md` ("Implementation notes: numpy port, quality-bound divergence, deferred per-horse calibration"). | 15m |
| 12 | Commit + push + PR #10 against main. PR body must explicitly note: numpy port, no `time_below_z1_s`, synthetic data caveat, real-H10 follow-up pending. | 20m |

**Budget:** ~3h30m.

## Pre-recompute backup (Step 1 detail)

Before recomputing the Slice 10 synthetic session, snapshot the v0.3.0 row:

```sql
select row_to_json(m.*) from session_metrics m
where m.session_id = 'a3f6e541-44f1-4393-832e-626b52689a65';
```

Pipe to `proof/slice-11/pre-recompute-row.json`. Reason: `/recompute` deletes the existing row before the new insert. The v0.3.0 row is the only artefact of "what TRIMP added." If the contractor or thesis review wants a side-by-side, this file is it.

## Synthetic-smoke caveat (Step 10 detail)

The Slice 10 synthetic session is 60 samples of `RR=800±30ms sin wave, HR≈75bpm`. At HR=75 with `hr_max_bpm=225, hr_rest_bpm=32`:
- `%HRr = (75-32)/(225-32) ≈ 0.223` → way below Z1's 50% HRmax floor
- `pct_max = 75/225 ≈ 0.333` → all 60 samples bucket as "below Z1" (unbucketed)
- All `time_z1_s..z5_s = 0`
- TRIMP non-zero but small (~0.1)
- `avg_hr_pct ≈ 33.3`

This is **not a bug** — synthetic data was built for HRV validation, not workload. Real H10 ride data (with HR climbing into Z2-Z4 during trot/canter) is what validates the zone bucketing meaningfully. Document in the proof artefact.

## Verification (manual gate)

1. **Spec-test parity:** the three pytest cases from `docs/algorithms/05-trimp-zones.md:131-153` pass against the numpy port.
2. **Synthetic-session re-compute:** `/recompute` of Slice 10's session writes a row with `algo_version='0.4.0'`, trimp+zones populated, expected flat-Z1 distribution.
3. **Real H10 capture (deferred to post-band wakeup):** re-run on a real ride. Expect TRIMP > 0 across multiple zones; avg_hr_pct in 50-80% range. Save to `proof/slice-11/post-recompute-real-row.json`.

## Kill switch

Build plan §276: TRIMP is closed-form math. If anything is hard, the bug is in our wiring, not the algorithm. If neurokit2 happens to expose Banister TRIMP — ignore it; spec says write the formula. No new deps.

## Files created / changed (summary)

**New (4):**
- `web/supabase/migrations/016_trimp_zones.sql`
- `algo/algorithms/trimp_zones.py`
- `algo/tests/test_trimp_zones.py`
- `proof/slice-11/pre-recompute-row.json` + `post-recompute-synthetic-row.json` (artefacts, not source)

**Edited (8):**
- `algo/service/data.py` (+ `read_hr_only_samples`)
- `algo/service/routes/_pipeline.py` (+ trimp wiring)
- `algo/service/data_types.py` (+ 6 fields on SessionMetricsRow)
- `algo/algorithms/version.py` (0.4.0)
- `algo/tests/test_compute_endpoint.py`, `test_health.py`, `test_data_layer.py`
- `web/lib/supabase/types.ts` (regen)
- `docs/algorithms/05-trimp-zones.md` (implementation notes addendum)

All source files ≤150 lines (Rule 1). Pydantic `extra='forbid'` (Rule 9). `algo_version` in every row (Rule 13). Web → algo only (Rule 11). Integration tests mandatory (Rule 5).

## Out of scope (do NOT do in this slice)

- Recovery τ → Slice 11.5 (separate PR)
- Per-horse HRmax/HRrest calibration → V.1
- Admin UI for TRIMP/zones → Slice 16
- `time_below_z1_s` (deliberately skipped — flag in PR)
- ECG/ACC compute → Slice 12+
- pandas dep — numpy port stays

## PR body must include

- Locked decisions table (above)
- Numpy-port rationale
- Why no `time_below_z1_s`
- Synthetic-data caveat with link to `proof/slice-11/`
- Phase 4 opener — Phase 3 must be closed before merge
- Real-H10 capture as a follow-up, not a blocker (Slice 11 is band-independent on the algo side; the smoke is)

---

## Decisions during implementation (addendum — fill in as work happens)

> Append-only log of any departure from plan-as-written. Empty until coding begins.

- _none yet_

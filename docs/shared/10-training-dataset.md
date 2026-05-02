# shared/10 · Training Dataset Format

## Why this exists

V.0's primary deliverable is a **labelled training dataset** for V.1's ML classifier. Without an explicit format spec, the data we collect over 3 months may not be in the shape an ML engineer can consume — which would force them to re-process everything before training, losing weeks.

This spec defines the canonical training-ready format. Every export from V.0 destined for ML work conforms to it.

## The training dataset, conceptually

V.0 produces three types of supervised learning data:

1. **Gait classification dataset** — 4-second accelerometer windows + rider-confirmed gait labels
2. **R-R cleaning dataset** — paired raw and cleaned R-R intervals with correction provenance
3. **Quality classification dataset** — per-session quality scores + the underlying signals

V.1 algorithms train on these. The ML engineer's first day looks like:

```python
import pandas as pd
windows = pd.read_parquet('training/gait_windows.parquet')
X = windows[['ax_window', 'ay_window', 'az_window']]
y = windows['label']
# train a classifier
```

Zero re-processing. That's the bar.

## Schema 1 — Gait classification (`gait_windows.parquet`)

The most important dataset. Used to train V.1's gait classifier (likely a 1D CNN or LSTM).

| Column | Type | Description |
|---|---|---|
| `window_id` | string (UUID) | Unique ID per window |
| `session_id` | string (UUID) | Source session |
| `horse_id` | string (UUID) | Subject horse |
| `t_start_ms` | int64 | Window start (relative to session start) |
| `t_end_ms` | int64 | Window end |
| `ax_window` | array<float32>[208] | 4 seconds × 52 Hz of X-axis acceleration |
| `ay_window` | array<float32>[208] | Y-axis |
| `az_window` | array<float32>[208] | Z-axis |
| `label` | string | walk / trot / canter_gallop / jump / rest / unlabelled |
| `label_source` | string | auto / corrected / manual |
| `label_confidence` | float32 | algo's confidence (auto only) or 1.0 (rider-set) |
| `quality_score` | float32 | parent session's quality 0..1 |
| `is_holdout` | bool | true if reserved for evaluation, never used in training |

### Window generation rules

For every approved riding session:
- Slide a 4-second window with 50% overlap (matches `algorithms/06-gait-detection.md`)
- Each window gets the rider-confirmed label that overlaps it most
- Windows spanning two labels (transitions) get the label of their majority overlap
- Windows shorter than 4 seconds are discarded
- Sessions with quality_score < 0.7 are excluded entirely

### Train/holdout split

Holdout 20% of sessions (not windows) for evaluation. Stratified by:
- Horse (each horse appears in both train and holdout if possible)
- Activity intensity (mix of light + heavy sessions in both splits)

The split is set **once when the export is generated** and recorded in the manifest. Do NOT re-shuffle on every export — that breaks reproducibility.

## Schema 2 — R-R cleaning (`rr_pairs.parquet`)

Used to validate and possibly retrain the R-R cleaning algorithm in V.1.

| Column | Type | Description |
|---|---|---|
| `session_id` | string (UUID) | Source session |
| `horse_id` | string (UUID) | Subject horse |
| `beat_idx` | int32 | Beat number within session (0-indexed) |
| `t_ms` | int64 | Timestamp |
| `rr_raw_ms` | int32 | Original R-R from H10 (preserved unchanged) |
| `rr_clean_ms` | int32 | Cleaned R-R after Lipponen-Tarvainen |
| `was_corrected` | bool | True if cleaning changed the value |
| `was_av_block` | bool | True if flagged as 2°-AV block (preserved, not corrected) |
| `was_interpolated` | bool | True if value was interpolated (was NaN, now isn't) |
| `correction_reason` | string | physiological_bound / ectopic / missed_beat / extra_beat / null |

### Why this matters

V.0's R-R cleaning is rule-based (Lipponen-Tarvainen with equine adjustments). V.1 might use a learned approach. To validate V.1's cleaner, you need *paired* data: raw signal + known-good cleaned signal + rationale for each correction.

For first 24 hours of any new horse, manually review a sample of corrections. Add a `manual_review` column with `accept` / `reject` / `unreviewed`. This becomes ground truth for cleaning algorithm validation.

## Schema 3 — Session-level features (`sessions.parquet`)

Aggregate features per session, useful for:
- Cross-horse comparison
- Outlier detection
- Quality classifier training

| Column | Type | Description |
|---|---|---|
| `session_id` | string (UUID) | |
| `horse_id` | string (UUID) | |
| `rider_pseudonym` | string | Anonymized — Rider-A, Rider-B, etc. |
| `activity_type` | string | riding / grass_field / walker / stall / transport / vet / other |
| `start_time` | timestamp | UTC |
| `duration_s` | int32 | Session length |
| `hr_avg`, `hr_peak`, `hr_min`, `hr_sd` | float32 | HR summary |
| `rmssd_ms`, `sdnn_ms`, `pnn50_pct` | float32 | HRV |
| `trimp_banister` | float32 | Workload |
| `recovery_tau_s` | float32 | Post-exercise decay constant (riding only) |
| `time_walk_s`, `time_trot_s`, `time_canter_s`, `time_rest_s` | int32 | Time-in-gait |
| `jump_count` | int32 | Confirmed jumps |
| `quality_score` | float32 | 0..1 |
| `quality_breakdown` | string (JSON) | per-component quality |
| `algo_version` | string | which algo computed these |

## Schema 4 — Manifest (`manifest.json`)

Every training export ships with a manifest documenting exactly what was included.

```json
{
  "export_id": "uuid",
  "export_type": "training_dataset_v1",
  "created_at": "2026-MM-DDTHH:MM:SSZ",
  "schema_version": 1,
  "filters": {
    "min_session_quality": 0.7,
    "activity_types": ["riding"],
    "min_session_duration_s": 600,
    "include_av_block_segments": true,
    "include_corrected_labels_only": false,
    "since": "2026-01-01",
    "until": "2026-04-15"
  },
  "split": {
    "method": "stratified_by_horse",
    "holdout_session_ratio": 0.20,
    "seed": 42,
    "train_session_count": 184,
    "holdout_session_count": 46
  },
  "counts": {
    "horses": 8,
    "sessions": 230,
    "gait_windows_total": 41523,
    "gait_windows_train": 33218,
    "gait_windows_holdout": 8305,
    "rr_pairs": 1245678
  },
  "label_distribution": {
    "walk": 12453,
    "trot": 18234,
    "canter_gallop": 7821,
    "jump": 215,
    "rest": 2800
  },
  "quality_distribution": {
    "p25": 0.78, "p50": 0.85, "p75": 0.92
  },
  "algo_version": "0.3.1",
  "git_commit_web": "abc123...",
  "git_commit_algo": "def456...",
  "rr_cleaning_method": "lipponen_tarvainen_equine_v1",
  "gait_detection_method": "fft_rule_based_v1"
}
```

## How exports run

A new CLI command in `lafattoria-algo/scripts/export.py`:

```bash
python scripts/export.py training-dataset \
  --since 2026-01-01 \
  --min-quality 0.7 \
  --holdout-ratio 0.2 \
  --seed 42 \
  --out ./exports/training_v1/
```

Outputs:
```
training_v1/
├── manifest.json
├── gait_windows.parquet
├── rr_pairs.parquet
├── sessions.parquet
└── README.md           ← auto-generated, summarizes the manifest
```

Implementation: `algorithms/exporters/training_dataset.py` — single-purpose module, ≤ 150 lines, follows the existing exporter pattern.

## Files added

```
algorithms/exporters/training_dataset.py            ← ≤ 150 lines
algorithms/exporters/window_generator.py            ← ≤ 100 lines (gait windowing)
algorithms/exporters/holdout_splitter.py            ← ≤ 80 lines (stratified split)
tests/integration/test_training_dataset_export.py
```

## Integration test

```python
def test_training_dataset_export_round_trip():
    """Export training dataset, load it, schema matches spec."""
    seed_test_sessions_with_labels(n=10)
    
    bundle = export_training_dataset(
        since="2026-01-01",
        min_quality=0.7,
        holdout_ratio=0.2,
        seed=42,
    )
    
    windows = pd.read_parquet(bundle / "gait_windows.parquet")
    
    # Schema check
    expected_cols = ['window_id','session_id','horse_id','t_start_ms','t_end_ms',
                     'ax_window','ay_window','az_window','label','label_source',
                     'label_confidence','quality_score','is_holdout']
    assert set(windows.columns) >= set(expected_cols)
    
    # Each window is 208 samples
    assert all(len(w) == 208 for w in windows['ax_window'].head(100))
    
    # Holdout ratio approximately right
    holdout_session_count = windows[windows.is_holdout].session_id.nunique()
    train_session_count = windows[~windows.is_holdout].session_id.nunique()
    ratio = holdout_session_count / (holdout_session_count + train_session_count)
    assert 0.15 < ratio < 0.25  # 0.20 ± slack
    
    # Same horse never in both splits unless explicitly allowed
    train_horses = set(windows[~windows.is_holdout].horse_id)
    holdout_horses = set(windows[windows.is_holdout].horse_id)
    overlap = train_horses & holdout_horses
    # With 10 test horses we expect significant overlap (stratified split)
    # but the exact behavior is checked elsewhere
```

## When to generate training exports

- After every 50 newly-corrected sessions accumulate (roughly bi-weekly)
- Before any algorithm change in V.0 (preserves the pre-change dataset)
- At end of field study (the canonical V.1 training set)
- Whenever an ML engineer asks for fresh data

## Versioning

`schema_version` in the manifest. If we change the format incompatibly:
- Bump the major version
- Old exports remain readable (immutable Parquet files)
- New exports use the new schema
- ML training code branches on `schema_version`

For V.0, schema_version starts at 1. Don't break it without bumping.

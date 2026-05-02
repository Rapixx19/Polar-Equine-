# shared/05 · Data Quality Monitoring

## Why this exists

Without this, you reach month 3 of the field study and discover 30% of your data is unusable. Data quality is V.0's primary risk. Build the monitoring before building the analytics.

## What "data quality" means for V.0

A session has good quality when:

1. **HR stream is dense and physiological** — at least 1 sample per second on average, no values <20 or >250 bpm
2. **R-R intervals are mostly clean** — artefact rate < 15% after Lipponen-Tarvainen cleaning
3. **Accelerometer stream is dense** — ≥ 95% of expected samples received (52 Hz × duration)
4. **No long gaps** — no single gap > 5 seconds in HR or ACC streams
5. **Contact is consistent** — `samples_hr.contact == true` for ≥ 90% of session
6. **Session metadata is complete** — horse, rider, activity_type all set; start and end times present

Every session gets a quality score 0-1 computed at session-end and persisted alongside the metrics.

## The quality score

```python
# algorithms/data_quality.py

@dataclass
class QualityResult:
    overall: float                    # 0..1
    hr_density: float                 # samples received / samples expected
    hr_physiological: float           # fraction within physiological bounds
    rr_artefact_rate: float           # 0..1, fraction of beats corrected
    acc_density: float                # samples received / samples expected
    contact_fraction: float           # fraction of session with contact=true
    longest_gap_s: float              # longest single gap, seconds
    n_dropouts: int                   # count of gaps > 1s
    
def evaluate(session_id: str) -> QualityResult:
    """
    Compute quality score for a completed session.
    
    Overall score = weighted geometric mean of components.
    Geometric mean penalizes any one component being very low,
    which is what we want: a session with 100% HR density but
    only 50% ACC density is a partial failure, not a 75% success.
    """
    ...
```

## How quality flows through the system

```
Session ends
    │
    ▼
Algo service /compute runs
    │
    ├──▶ rr_cleaning.clean(rr) → corrections count, AV-block segments
    ├──▶ hrv_metrics.compute(rr_clean) → HRV with quality
    ├──▶ trimp_zones.compute(hr) → workload with quality
    ├──▶ recovery_tau.fit(hr) → τ with quality
    ├──▶ gait_detection.detect_gaits(acc) → labels with confidence
    │
    └──▶ data_quality.evaluate(session_id)  ← NEW
              │
              ▼
        Write quality_score to session_metrics
        Write per-component quality to session_metrics.notes (JSON)
```

## Where quality is visible

### To the rider (PWA)

After session ends, the review screen shows a small badge:

```
┌─────────────────────────────────┐
│  ✓ Session saved                │
│  Data quality: Excellent (0.94) │
└─────────────────────────────────┘
```

For poor quality (< 0.5), the badge becomes a warning:

```
┌─────────────────────────────────┐
│  ⚠ Session saved with issues    │
│  Data quality: Poor (0.32)      │
│  → Band may have lost contact   │
│  → Try wetting the contact pads │
└─────────────────────────────────┘
```

This loops the rider into data quality awareness without lecturing them. They'll start to wet the band better when they see scores improving.

### To the admin (dashboard)

`/admin/today` shows a "data quality this week" chart and flags any session with score < 0.6 in red.

`/admin/sessions` table has a quality column with a colored dot:
- Green: ≥ 0.8
- Amber: 0.5 – 0.8
- Red: < 0.5

`/admin/horses/[id]` shows quality trends per horse — useful for spotting a band that's failing on a specific horse.

### In the database

```sql
ALTER TABLE session_metrics
  ADD COLUMN quality_score REAL,
  ADD COLUMN quality_breakdown JSONB;
```

`quality_breakdown` stores the per-component scores so we can investigate root causes.

## Alerts

For the field study, weekly summary email to admins:

```
La Fattoria — Week of 2026-MM-DD

Sessions logged: 47 (target 50)
Mean quality score: 0.81
Sessions below 0.5: 3
  - Hippo, 2026-MM-DD 14:30 (low contact)
  - Venus, 2026-MM-DD 09:15 (BLE dropout 47s)
  - Titan, 2026-MM-DD 16:45 (acc stream incomplete)

Bands needing attention:
  - Band 2: 4 sessions below 0.7 in last week → check contact pads
```

This is critical. Without it, you don't know data is degrading until you sit down to write the thesis.

## Minimum thresholds for inclusion in research dataset

For thesis analysis and the peer-reviewed paper, only sessions meeting these bars are included:

| Use | Min quality | Rationale |
|---|---|---|
| Per-horse trends | ≥ 0.7 | High enough to trust the metric |
| Cross-horse comparisons | ≥ 0.8 | Higher bar to reduce noise across horses |
| HRV analysis | ≥ 0.85 | RMSSD is sensitive to small artefacts |
| Recovery τ | ≥ 0.8 | Fit quality depends on dense, clean post-peak data |
| Gait classifier training | ≥ 0.75 + rider-approved | Need labels we trust |

These thresholds are documented in the thesis methodology section.

## Files

```
algorithms/data_quality.py             ← ≤ 130 lines, public function evaluate()
tests/unit/test_data_quality.py
web/components/quality/QualityBadge.tsx          ← ≤ 60 lines
web/components/quality/QualityDot.tsx            ← ≤ 40 lines
web/components/admin/QualityWeeklyChart.tsx      ← ≤ 100 lines
```

## Integration test

```python
# tests/integration/test_data_quality.py

def test_quality_score_for_clean_session():
    """A synthetic perfect session scores ~1.0."""
    session_id = seed_perfect_session()
    result = data_quality.evaluate(session_id)
    assert result.overall > 0.9
    assert result.hr_density > 0.95

def test_quality_drops_for_dropout_session():
    """A session with a 30s BLE dropout scores significantly lower."""
    session_id = seed_session_with_dropout(gap_s=30)
    result = data_quality.evaluate(session_id)
    assert result.overall < 0.6
    assert result.longest_gap_s >= 30
```

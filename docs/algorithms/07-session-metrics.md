# algorithms/07 · Session Metrics (Orchestration)

## Feature scope

The orchestrator that runs all algorithm modules in order and composes a single `session_metrics` row to write to the database.

## Public interface

```python
# algorithms/session_metrics.py

from dataclasses import dataclass, asdict
import pandas as pd

@dataclass
class SessionMetricsRow:
    session_id: str
    duration_s: int
    
    # HR summary
    hr_avg: float
    hr_peak: int
    hr_min: int
    hr_sd: float
    
    # HRV
    rmssd_ms: float | None
    sdnn_ms: float | None
    pnn50_pct: float | None
    
    # Workload
    trimp_banister: float
    
    # Recovery
    recovery_tau_s: float | None
    
    # Time in zones
    time_z1_s: int
    time_z2_s: int
    time_z3_s: int
    time_z4_s: int
    time_z5_s: int
    
    # Time in gaits
    time_walk_s: int
    time_trot_s: int
    time_canter_s: int
    time_gallop_s: int
    time_rest_s: int
    jump_count: int
    
    # Versioning + quality
    algo_version: str
    quality_score: float
    notes: str  # JSON: per-module quality details

def compose(
    session,                              # session row from DB
    hr_samples: pd.DataFrame,
    rr_clean,                             # output of rr_cleaning.clean
    hrv,                                  # HRVResult
    workload,                             # WorkloadResult
    recovery,                             # RecoveryResult or None for rest sessions
    gait_segments: list,                  # list of GaitSegment
) -> SessionMetricsRow:
    """
    Compose a single session_metrics row from per-module results.
    
    For rest sessions (rest_field, rest_walker, rest_stall):
    - Skip recovery (no exercise to recover from)
    - Skip gait time (none expected)
    - HRV more meaningful (no exercise contamination)
    
    For riding sessions:
    - All metrics populated
    - Time-in-gait sums should approximate duration_s
    
    Quality score:
    - Weighted average of per-module quality scores
    - Weights reflect relative importance:
        HR/HRV  = 40%
        Workload = 30%
        Recovery = 15%
        Gait    = 15%
    - For rest sessions: HR/HRV=70%, Workload=30%
    """
    is_rest = session.activity_type.startswith("rest_")
    
    # HR summary
    hr_values = hr_samples["hr_bpm"].dropna()
    hr_avg = float(hr_values.mean()) if len(hr_values) else 0.0
    hr_peak = int(hr_values.max()) if len(hr_values) else 0
    hr_min = int(hr_values.min()) if len(hr_values) else 0
    hr_sd = float(hr_values.std()) if len(hr_values) > 1 else 0.0
    
    # Time in gaits
    time_walk_s = sum(_dur(s) for s in gait_segments if s.label_type == "walk")
    time_trot_s = sum(_dur(s) for s in gait_segments if s.label_type == "trot")
    time_canter_s = sum(_dur(s) for s in gait_segments if s.label_type == "canter_gallop")
    time_gallop_s = 0  # merged into canter_gallop in V.0
    time_rest_s = sum(_dur(s) for s in gait_segments if s.label_type == "rest")
    jump_count = sum(s.jump_count for s in gait_segments if s.label_type == "jump")
    
    # Quality score
    if is_rest:
        quality = 0.7 * hrv.quality + 0.3 * workload.quality
    else:
        recovery_q = recovery.quality if recovery else 0.0
        gait_q = _gait_quality(gait_segments)
        quality = (
            0.40 * hrv.quality
            + 0.30 * workload.quality
            + 0.15 * recovery_q
            + 0.15 * gait_q
        )
    
    notes = json.dumps({
        "hrv_quality": hrv.quality,
        "workload_quality": workload.quality,
        "recovery_quality": recovery.quality if recovery else None,
        "rr_clean_corrections": rr_clean[1]["n_corrected"],
        "rr_av_blocks": len(rr_clean[1]["av_block_segments"]),
        "gait_segment_count": len(gait_segments),
    })
    
    return SessionMetricsRow(
        session_id=session.id,
        duration_s=workload.duration_s,
        hr_avg=hr_avg, hr_peak=hr_peak, hr_min=hr_min, hr_sd=hr_sd,
        rmssd_ms=hrv.rmssd_ms if not np.isnan(hrv.rmssd_ms) else None,
        sdnn_ms=hrv.sdnn_ms if not np.isnan(hrv.sdnn_ms) else None,
        pnn50_pct=hrv.pnn50_pct if not np.isnan(hrv.pnn50_pct) else None,
        trimp_banister=workload.trimp_banister,
        recovery_tau_s=recovery.tau_s if recovery else None,
        time_z1_s=workload.time_z1_s,
        time_z2_s=workload.time_z2_s,
        time_z3_s=workload.time_z3_s,
        time_z4_s=workload.time_z4_s,
        time_z5_s=workload.time_z5_s,
        time_walk_s=time_walk_s,
        time_trot_s=time_trot_s,
        time_canter_s=time_canter_s,
        time_gallop_s=time_gallop_s,
        time_rest_s=time_rest_s,
        jump_count=jump_count,
        algo_version=os.environ.get("ALGO_VERSION", "0.1.0"),
        quality_score=quality,
        notes=notes,
    )


def _dur(seg) -> int:
    return int((seg.end_ms - seg.start_ms) / 1000)


def _gait_quality(segments) -> float:
    """Mean confidence of gait segments, 0 if empty."""
    if not segments:
        return 0.0
    return float(np.mean([s.confidence for s in segments]))
```

## Wiring in the FastAPI route

In `app/routes/compute.py` (already specified in 01-service-api.md):

```python
metrics_row = session_metrics.compose(
    session=session,
    hr_samples=hr_samples,
    rr_clean=(rr_cleaned, rr_info),
    hrv=hrv_result,
    workload=workload_result,
    recovery=recovery_result if not is_rest else None,
    gait_segments=labels,
)
await write_session_metrics(req.session_id, metrics_row)
```

## Tests

```python
# tests/integration/test_full_session.py

@pytest.mark.asyncio
async def test_full_session_produces_complete_metrics(test_db):
    """End-to-end: ingest a real fixture, run full pipeline, assert all fields."""
    session_id = await seed_session_from_fixture("healthy_session_50min.parquet")
    
    response = await algo_client.post("/compute", json={"session_id": session_id})
    assert response.status_code == 200
    
    row = await test_db.fetch_session_metrics(session_id)
    
    assert row.duration_s > 2400 and row.duration_s < 3300  # ~50 min
    assert 60 < row.hr_avg < 200
    assert row.trimp_banister > 0
    assert row.rmssd_ms is not None and row.rmssd_ms > 0
    assert row.recovery_tau_s is None or 30 < row.recovery_tau_s < 300
    assert row.quality_score > 0.5
```

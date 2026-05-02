# algorithms/03 · HRV Metrics

## Feature scope

Compute time-domain heart rate variability metrics from cleaned R-R intervals.

## Public interface

```python
# algorithms/hrv_metrics.py

from dataclasses import dataclass
import numpy as np

@dataclass
class HRVResult:
    rmssd_ms: float
    sdnn_ms: float
    pnn50_pct: float
    pnn20_pct: float
    mean_rr_ms: float
    n_beats: int
    quality: float                      # 0..1, factors in artefact rate

def compute(rr_clean_ms: np.ndarray, min_beats: int = 30) -> HRVResult:
    """
    Compute time-domain HRV metrics from cleaned R-R intervals.
    
    Time-domain metrics are the most robust for short-window analysis:
    - RMSSD (Root Mean Square of Successive Differences) — primary parasympathetic indicator
    - SDNN (Standard Deviation of NN intervals) — overall variability
    - pNN50 (percent of NN intervals > 50ms different from previous)
    - pNN20 — same but >20ms threshold
    
    Equine notes:
    - At resting HR ~30 bpm, a 5-min window has only ~150 beats (vs ~300 in humans)
    - RMSSD typical range at rest: 100-300 ms (vs 30-50 ms humans)
    - pNN50 saturates near 100% at rest in horses → keep but treat as low-information
    - Compute per-window for time-resolved analysis; otherwise per-segment
    
    Algorithm:
    - SDNN = std(rr) with ddof=1
    - RMSSD = sqrt(mean(diff(rr)^2))
    - pNN50 = count(|diff(rr)| > 50ms) / (n-1) * 100
    
    References:
    - Task Force 1996 Eur Heart J 17:354 (foundation)
    - Stucke et al. 2015 Appl Anim Behav Sci 166:1 (equine windowing)
    - Physick-Sheard 2000 Equine Vet J 32:253
    """
    if len(rr_clean_ms) < min_beats:
        return HRVResult(
            rmssd_ms=np.nan, sdnn_ms=np.nan,
            pnn50_pct=np.nan, pnn20_pct=np.nan,
            mean_rr_ms=np.nan, n_beats=len(rr_clean_ms), quality=0.0
        )
    
    rr = rr_clean_ms.astype(float)
    diff = np.diff(rr)
    
    rmssd = np.sqrt(np.mean(diff ** 2))
    sdnn = np.std(rr, ddof=1)
    pnn50 = np.sum(np.abs(diff) > 50.0) / len(diff) * 100.0
    pnn20 = np.sum(np.abs(diff) > 20.0) / len(diff) * 100.0
    
    return HRVResult(
        rmssd_ms=float(rmssd),
        sdnn_ms=float(sdnn),
        pnn50_pct=float(pnn50),
        pnn20_pct=float(pnn20),
        mean_rr_ms=float(np.mean(rr)),
        n_beats=len(rr),
        quality=1.0 if len(rr) >= 60 else len(rr) / 60.0,
    )


def compute_windowed(
    rr_clean_ms: np.ndarray,
    timestamps_ms: np.ndarray,
    window_s: int = 300,
    overlap: float = 0.5,
) -> list[HRVResult]:
    """
    Compute HRV per rolling window. Used for trends within long sessions.
    """
    # Implementation using overlapping time windows
    ...
```

## Tests

```python
# tests/unit/test_hrv_metrics.py

def test_rmssd_known_values():
    """RMSSD on a known input matches hand-calculated."""
    rr = np.array([1000, 1100, 1050, 1150, 1100], dtype=float)
    result = compute(rr)
    expected_rmssd = np.sqrt(np.mean(np.diff(rr) ** 2))
    assert abs(result.rmssd_ms - expected_rmssd) < 0.1

def test_returns_nan_for_short_series():
    """Below min_beats threshold returns NaN."""
    result = compute(np.array([1000, 1100]))
    assert np.isnan(result.rmssd_ms)
    assert result.quality == 0.0

def test_realistic_horse_at_rest():
    """A realistic resting horse R-R series produces sensible HRV values."""
    rr = simulate_resting_horse_rr(n_beats=180)
    result = compute(rr)
    assert 50 < result.rmssd_ms < 400  # equine resting range
    assert 30 < result.mean_rr_ms / 60 < 50  # 30-50 bpm equiv

def test_consistent_with_neurokit():
    """Cross-check our implementation against neurokit2."""
    import neurokit2 as nk
    rr = np.random.normal(2000, 100, size=200)
    ours = compute(rr)
    
    # neurokit expects peak indices, not RR; convert
    peaks = np.cumsum(rr).astype(int)
    nk_result = nk.hrv_time(peaks, sampling_rate=1000)
    
    assert abs(ours.rmssd_ms - nk_result["HRV_RMSSD"][0]) < 1.0
```

## Failure modes

| Issue | Behavior |
|---|---|
| Empty input | Returns all-NaN result with quality=0 |
| All identical RRs | RMSSD=0, SDNN=0; valid output |
| Outliers passed in (cleaning skipped) | Output is biased high; document that callers must clean first |
| Mixed activity windows (rest + exercise) | Output combines both, less interpretable; use compute_windowed |

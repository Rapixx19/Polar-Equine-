# algorithms/02 · R-R Cleaning

## Feature scope

Clean R-R interval series from Polar H10 by detecting and correcting ectopic beats, missed beats, and artefacts. Adapted for equine cardiac physiology.

## Public interface

```python
# algorithms/rr_cleaning.py

from dataclasses import dataclass
import numpy as np

@dataclass
class CleaningConfig:
    rr_min_ms: int = 800       # 75 bpm — physiological lower bound for horses
    rr_max_ms: int = 3000      # 20 bpm — physiological upper bound
    ectopic_threshold: float = 0.45    # Malik rule relaxed for horses
    iterative: bool = True
    flag_av_block: bool = True

def clean(
    rr_ms: np.ndarray,
    config: CleaningConfig = CleaningConfig()
) -> tuple[np.ndarray, dict]:
    """
    Clean R-R intervals using Lipponen & Tarvainen 2019 with equine adjustments.
    
    Returns: (cleaned_rr_ms, info_dict)
        info_dict contains:
        - n_corrected: int
        - av_block_segments: list[(start_idx, end_idx)]
        - quality: 0..1 score
    
    Why equine-specific:
    - Resting HR ~30 bpm means RR ~2000ms baseline (vs ~800ms in humans)
    - Physiological 2°-AV block is common at rest in horses (NOT an artefact)
    - RSA can produce |ΔRR| up to 600ms in healthy animals
    
    Algorithm (Lipponen & Tarvainen 2019, J Med Eng Technol 43:173):
    1. Compute dRR(j) = RR(j+1) - RR(j) and mRR(j) = RR(j) - local_median
    2. Compute time-varying thresholds Th1(j), Th2(j) from quartile-based MAD * 5.2
    3. Classify each beat as: normal, extra, missed, long, short, ectopic
    4. Corrections:
       - extras → remove R-wave
       - missed → insert at midpoint  
       - long/short → cubic spline interpolation
       - ectopic → cubic spline replacement
    5. Iterate until artefact count converges
    
    Equine adaptations:
    - Pre-screen for 2°-AV block (RR alternating between ~T and ~2T) and EXCLUDE
      from automatic correction (otherwise the algo erroneously interpolates them)
    - Threshold scales with RR baseline (humans use absolute ms; we use relative)
    
    References:
    - Tarvainen et al. 2014 Comput Methods Programs Biomed 113:210
    - Lipponen & Tarvainen 2019 J Med Eng Technol 43:173
    - Mott et al. 2021 Appl Anim Behav Sci 244:105449 (Polar in horses)
    """
    info = {"n_corrected": 0, "av_block_segments": [], "quality": 1.0}
    
    # Step 1: Physiological bound check
    rr = rr_ms.copy().astype(float)
    invalid = (rr < config.rr_min_ms) | (rr > config.rr_max_ms)
    rr[invalid] = np.nan
    
    # Step 2: Detect 2°-AV block segments and mark for protection
    if config.flag_av_block:
        av_segments = _detect_av_block(rr)
        info["av_block_segments"] = av_segments
    
    # Step 3: Lipponen-Tarvainen on the rest
    rr_clean = _lipponen_tarvainen(rr, config, protected_segments=av_segments)
    
    # Step 4: Linear interpolation of any remaining NaN
    rr_clean = _interpolate_nan(rr_clean)
    
    info["n_corrected"] = int(np.sum(rr_clean != rr_ms))
    info["quality"] = _quality_score(rr_clean, info["n_corrected"], len(rr_ms))
    
    return rr_clean, info


def _detect_av_block(rr: np.ndarray) -> list[tuple[int, int]]:
    """
    Detect 2°-AV block: a true skipped beat shows as RR ≈ 2× preceding RR.
    Look for alternating short-long-short or 2:1 patterns.
    """
    # ... implementation
    return []


def _lipponen_tarvainen(rr, config, protected_segments):
    """
    Core Lipponen-Tarvainen algorithm. Use neurokit2's implementation
    as the reference, but skip protected segments.
    """
    import neurokit2 as nk
    # ... wrap nk.signal_fixpeaks
```

## Why we delegate to neurokit2

`neurokit2.signal_fixpeaks(method='kubios')` is a faithful re-implementation of the published Tarvainen algorithm. Reproducing it from scratch is error-prone. We wrap it and add equine pre/post-processing.

## Quality score

```
quality = max(0.0, 1.0 - n_corrected / n_total)
```

Where:
- `n_total` = length of the input array (pre-cleaning).
- `n_corrected` = count of RR positions where `rr_clean[i] != rr_input_after_bounds_check[i]` (i.e. the kubios pass moved a value), unioned with the count of values that failed the physiological bounds check (`rr < rr_min_ms` or `rr > rr_max_ms`). Bounds-failed positions count even if the linear interpolation lands them at a value the kubios pass would also have produced — they were "corrected" by the bounds step.
- `quality = 1.0` means nothing was touched. `quality = 0.0` means every beat was modified. The `max(0.0, ...)` is a defensive floor (the formula can't go negative in practice but the clamp is documented anyway).
- `n_total == 0` (empty input) raises `ValueError("no_valid_beats")` rather than dividing by zero. The same exception fires when every input value fails the bounds check (so `rr_bounded` is all-NaN) — there's nothing to interpolate from. Callers map this to HTTP 422.

This is independent of `hrv_metrics.compute()`'s `quality` (which is `min(1.0, n_beats / 60)` — a measure of input length vs. the 60-beat short-term target). The `/compute` response surfaces both as `rr_cleaning_quality` and `hrv_completeness_quality` so consumers can distinguish "noisy input" from "too-short input".

## Tests

```python
# tests/unit/test_rr_cleaning.py

def test_clean_handles_ectopic_beats():
    """A clear ectopic beat is corrected."""
    rr = np.array([1850, 1830, 800, 1820, 1840])  # 800 is ectopic
    cleaned, info = clean(rr)
    assert info["n_corrected"] == 1
    assert 1700 < cleaned[2] < 1900

def test_preserves_av_block():
    """A 2°-AV block segment is not corrected."""
    # 2:1 alternating pattern at rest
    rr = np.array([1900, 3800, 1900, 3800, 1900, 3800])
    cleaned, info = clean(rr)
    assert info["av_block_segments"] != []
    # Pattern should be preserved, not interpolated
    assert np.allclose(cleaned, rr, atol=10)

def test_handles_physiological_bounds():
    """RRs outside physiological range get marked NaN, then interpolated."""
    rr = np.array([1850, 50, 1850, 5000, 1850])  # 50 and 5000 invalid
    cleaned, info = clean(rr)
    assert not np.any(np.isnan(cleaned))
    assert all(800 <= x <= 3000 for x in cleaned)

def test_idempotent():
    """Running clean twice produces the same output."""
    rr = realistic_rr_series(1000)
    once, _ = clean(rr)
    twice, _ = clean(once)
    assert np.allclose(once, twice)
```

## Failure modes

| Issue | Cause | Mitigation |
|---|---|---|
| Over-correction at rest | Algorithm sees AV block as artefact | Pre-screen step protects them |
| Under-correction at exercise | Higher HR means tighter intervals, smaller relative thresholds | Scale thresholds with RR baseline |
| All-NaN session | Sensor was off the horse | Return zero-quality flag, skip downstream metrics |
| Spurious 2°-AV detection | Healthy RSA can mimic 2:1 pattern briefly | Require pattern duration >5s before flagging |

## Validation strategy

For first 24 h of any new horse: manual review of cleaned R-R against raw R-R via the admin Session Detail page. Adjust thresholds if needed before continuing.

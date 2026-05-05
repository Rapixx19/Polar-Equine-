# algorithms/04 · Recovery τ (Post-Exercise HR Decay)

## Feature scope

Fit an exponential decay to the post-exercise HR curve to extract τ (tau), the time constant of cardiovascular recovery. A central welfare and fitness indicator.

## Public interface

```python
# algorithms/recovery_tau.py

from dataclasses import dataclass
import numpy as np
import pandas as pd

@dataclass
class RecoveryConfig:
    min_decay_seconds: int = 60          # need at least this much post-peak data
    min_decay_drop_bpm: int = 20         # need HR to actually drop this much
    fit_window_seconds: int = 300        # fit over first 5 min of recovery
    detect_peak_window_s: int = 30       # peak = max HR in this rolling window
    
@dataclass
class RecoveryResult:
    tau_s: float | None                  # seconds; None if fit failed
    hr_peak_bpm: float
    hr_baseline_bpm: float               # asymptote of the fit
    rmse_bpm: float                      # fit quality
    n_samples: int
    quality: float                       # 0..1

def fit(
    hr_samples: pd.DataFrame,            # columns: t_ms, hr_bpm
    config: RecoveryConfig = RecoveryConfig()
) -> RecoveryResult:
    """
    Fit HR(t) = HR_baseline + (HR_peak - HR_baseline) * exp(-t/τ) 
    to the post-exercise recovery curve.
    
    τ is the time constant — the time for HR to drop to 1/e (~37%) of the way
    from peak to baseline. Lower τ = faster recovery = better cardiovascular fitness
    or lower workload.
    
    Equine context (Art et al. 1990, Marlin & Nankervis 2002):
    - Healthy horse after submaximal exercise: τ typically 60-120 s
    - Highly fit horse: τ as low as 30 s
    - Fatigued or unwell: τ > 200 s
    - Failure to recover at all (HR plateau) flags potential health concern
    
    Algorithm:
    1. Smooth HR with 5-second rolling median
    2. Locate peak = max smoothed HR in the session
    3. Decay segment = [peak_time, peak_time + fit_window_seconds]
    4. Validate: at least min_decay_drop_bpm drop within window
    5. Fit single-exponential via scipy.optimize.curve_fit
    6. Compute residual RMSE; quality score from RMSE relative to dynamic range
    
    References:
    - Art et al. 1990 Equine Vet J Suppl 9:71 (early equine recovery work)
    - Marlin & Nankervis 2002 "Equine Exercise Physiology" (textbook ref)
    - Buchheit & Laursen 2013 Sports Med 43:313 (τ as fitness marker, human)
    - Munsters et al. 2013 Vet J 198:e98 (Polar in eventing horses)
    """
    if len(hr_samples) < 30:
        return _failed_result(hr_samples, "insufficient_data")
    
    hr = hr_samples.sort_values("t_ms").reset_index(drop=True)
    hr["hr_smooth"] = hr["hr_bpm"].rolling(5, min_periods=1, center=True).median()
    
    # Find peak
    peak_idx = hr["hr_smooth"].idxmax()
    peak_t = hr.loc[peak_idx, "t_ms"]
    peak_hr = hr.loc[peak_idx, "hr_smooth"]
    
    # Slice decay window
    decay_end_t = peak_t + config.fit_window_seconds * 1000
    decay = hr[(hr["t_ms"] >= peak_t) & (hr["t_ms"] <= decay_end_t)].copy()
    decay["t_rel_s"] = (decay["t_ms"] - peak_t) / 1000.0
    
    if (decay["t_rel_s"].max() < config.min_decay_seconds or
        peak_hr - decay["hr_smooth"].min() < config.min_decay_drop_bpm):
        return _failed_result(hr, "insufficient_decay")
    
    # Fit
    from scipy.optimize import curve_fit
    
    def model(t, baseline, amplitude, tau):
        return baseline + amplitude * np.exp(-t / tau)
    
    try:
        guess_baseline = decay["hr_smooth"].iloc[-10:].mean()
        guess_amplitude = peak_hr - guess_baseline
        guess_tau = 90.0
        
        popt, _ = curve_fit(
            model,
            decay["t_rel_s"].values,
            decay["hr_smooth"].values,
            p0=[guess_baseline, guess_amplitude, guess_tau],
            bounds=([20, 5, 5], [120, 200, 600]),  # equine physiological bounds
            maxfev=2000,
        )
        baseline, amplitude, tau = popt
        
        # Quality: residual RMSE relative to dynamic range
        predicted = model(decay["t_rel_s"].values, *popt)
        rmse = float(np.sqrt(np.mean((decay["hr_smooth"].values - predicted) ** 2)))
        dynamic_range = peak_hr - baseline
        quality = max(0.0, 1.0 - (rmse / max(dynamic_range, 1.0)))
        
        return RecoveryResult(
            tau_s=float(tau),
            hr_peak_bpm=float(peak_hr),
            hr_baseline_bpm=float(baseline),
            rmse_bpm=rmse,
            n_samples=len(decay),
            quality=quality,
        )
    except (RuntimeError, ValueError):
        return _failed_result(hr, "fit_failed")


def _failed_result(hr, reason):
    """Return a result with tau=None and quality=0; reason logged."""
    import structlog
    log = structlog.get_logger()
    log.warning("recovery_tau.fit_failed", reason=reason, n=len(hr))
    return RecoveryResult(
        tau_s=None,
        hr_peak_bpm=float(hr["hr_bpm"].max()) if len(hr) else 0,
        hr_baseline_bpm=float(hr["hr_bpm"].min()) if len(hr) else 0,
        rmse_bpm=np.nan,
        n_samples=len(hr),
        quality=0.0,
    )
```

## Tests

```python
# tests/unit/test_recovery_tau.py

def test_recovers_known_tau():
    """Synthetic HR with τ=80s recovers within ±10s."""
    t = np.arange(0, 600, 1)  # 10 min, 1 Hz
    true_tau = 80.0
    hr = 35 + 130 * np.exp(-t / true_tau) + np.random.normal(0, 1, len(t))
    df = pd.DataFrame({"t_ms": t * 1000, "hr_bpm": hr})
    
    result = fit(df)
    assert result.tau_s is not None
    assert abs(result.tau_s - true_tau) < 10
    assert result.quality > 0.9

def test_fails_on_no_recovery():
    """If HR doesn't drop, fit fails gracefully."""
    df = pd.DataFrame({
        "t_ms": np.arange(0, 600_000, 1000),
        "hr_bpm": np.full(600, 150.0)
    })
    result = fit(df)
    assert result.tau_s is None
    assert result.quality == 0.0

def test_handles_noisy_realistic_data():
    """Real-ish data with breathing-modulated noise still yields reasonable τ."""
    t = np.arange(0, 600, 1)
    hr = (35 + 130 * np.exp(-t / 90)
          + 4 * np.sin(2 * np.pi * 0.3 * t)        # respiratory component
          + np.random.normal(0, 2, len(t)))
    df = pd.DataFrame({"t_ms": t * 1000, "hr_bpm": hr})
    result = fit(df)
    assert 70 < result.tau_s < 110
```

## Failure modes

| Issue | Behavior |
|---|---|
| Session too short (no real exercise) | tau_s=None, quality=0 |
| Multiple peaks (interval workout) | Fits the decay after the global maximum; misses interior decays |
| HR sensor lost contact post-peak | Quality flag low; downstream consumers ignore |
| Rest sessions | Should not be called; orchestrator (07-session-metrics) skips for activity_type='rest_*' |

## V.1 enhancement

When custom band ships, recompute τ on every detected gait→walk transition (interval recovery). Track distribution of τ across the session, not just one value.

## V0.0 implementation addendum (Slice 11.5)

The shipping implementation in `algo/algorithms/recovery_tau.py` matches this spec but diverges on three load-bearing points worth flagging for the contractor M1 audit:

1. **No pandas dep.** The spec ships a pandas-based reference. The algo container uses `numpy` arrays with `scipy.signal.medfilt(kernel_size=5)` on a 1-Hz uniformly-resampled grid (via `np.interp` from raw irregular timestamps). Same outputs, smaller dep tree.
2. **Three-state `recovery_fit_quality` (migration 016 column comment is the contract).**
   * `NULL`        — not attempted (rest session). Route layer (`service/routes/_pipeline.py`) checks `session.activity_type in REST_ACTIVITIES = {"rest_pasture", "rest_stall", "rest_groundwork"}` and writes NULL/NULL directly without calling `fit()`.
   * `0.0`         — attempted but failed (`reason ∈ {"no_peak", "no_decay", "fit_failed", "dropout_during_decay"}`). `tau_s=None` in this branch.
   * `(0.0, 1.0]`  — successful fit; value is `1 - rmse / max(peak_hr − baseline, 1)`.
3. **Dropout guard.** `RecoveryConfig.max_gap_s = 10`. The fit is rejected (reason `"dropout_during_decay"`) when the **original** irregular timestamps inside the decay window have a `>10 s` gap — linear interp across a real-world dropout would fabricate a smooth ramp and bias τ downward.

The `tau` upper bound stays at **600 s** to match this spec (model bounds at :100). A `# TODO Slice 11.5+` in the implementation flags tightening toward ~300 s once contractor M1 has real-horse decay calibration data; equine literature (Art 1990, Marlin 2002) places fatigued τ at >200 s, and τ>300 s in practice usually indicates incomplete decay rather than biological signal.

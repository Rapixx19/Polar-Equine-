# algorithms/05 · TRIMP and HR Zones

## Feature scope

Compute Banister TRaining IMPulse (TRIMP) and time-in-zone breakdown. Workload metrics that summarize a session into a single number (TRIMP) and a 5-bucket distribution (zones).

## Public interface

```python
# algorithms/trimp_zones.py

from dataclasses import dataclass
import numpy as np
import pandas as pd

@dataclass
class WorkloadConfig:
    hr_max_bpm: float = 225.0           # equine default; per-horse override later
    hr_rest_bpm: float = 32.0           # equine default
    sex_factor: float = 1.92             # Banister's male coefficient (b)
    # Note: equine sex factor not validated; use 1.92 universally for V.0

@dataclass
class WorkloadResult:
    trimp_banister: float
    duration_s: int
    time_z1_s: int    # 50-60% HRmax
    time_z2_s: int    # 60-70%
    time_z3_s: int    # 70-80%
    time_z4_s: int    # 80-90%
    time_z5_s: int    # 90-100%
    avg_hr_pct: float
    quality: float

def compute(
    hr_samples: pd.DataFrame,            # columns: t_ms, hr_bpm
    config: WorkloadConfig = WorkloadConfig()
) -> WorkloadResult:
    """
    Compute Banister TRIMP and 5-zone time breakdown.
    
    Banister TRIMP weighting:
    TRIMP = sum_i [ Δt_i (min) * %HRr_i * 0.64 * exp(1.92 * %HRr_i) ]
    
    where %HRr = (HR - HR_rest) / (HR_max - HR_rest)
    
    The exponential weighting captures the non-linear physiological cost of
    exercise — 30 minutes at 90% costs much more than 30 minutes at 60%.
    
    Equine adaptations:
    - HRmax for horses: typically 220-240 bpm depending on breed/age
    - HRrest ~30-40 bpm (we use 32 as conservative default)
    - The exponential coefficient (1.92) was validated in humans; we use it
      as a reasonable starting point for horses pending validation.
    
    Time-in-zones:
    - Z1: 50-60% HRmax  — recovery / active rest
    - Z2: 60-70%        — endurance base
    - Z3: 70-80%        — tempo / steady work  
    - Z4: 80-90%        — threshold
    - Z5: 90-100%       — VO2 max range / sprints
    
    References:
    - Banister 1991 in "Physiological Testing of Elite Athletes"
    - Calvert et al. 1976 IEEE Trans Syst Man Cybern (mathematical foundation)
    - Munsters et al. 2013 Vet J 198:e98 (equine TRIMP application)
    """
    if len(hr_samples) == 0:
        return _empty_result()
    
    hr = hr_samples.sort_values("t_ms").reset_index(drop=True)
    
    # Compute per-sample dwell times (seconds)
    dt_s = np.diff(hr["t_ms"].values, prepend=hr["t_ms"].values[0]) / 1000.0
    dt_s = np.clip(dt_s, 0, 30)  # Cap to handle gaps
    
    # %HRr per sample
    hr_reserve = config.hr_max_bpm - config.hr_rest_bpm
    pct_hrr = np.clip((hr["hr_bpm"].values - config.hr_rest_bpm) / hr_reserve, 0, 1)
    
    # Banister TRIMP
    minute_dt = dt_s / 60.0
    weight = 0.64 * np.exp(config.sex_factor * pct_hrr)
    trimp = float(np.sum(minute_dt * pct_hrr * weight))
    
    # Zone bucketing — using fraction of HRmax (not HRr)
    pct_max = hr["hr_bpm"].values / config.hr_max_bpm
    z1 = float(np.sum(dt_s[(pct_max >= 0.50) & (pct_max < 0.60)]))
    z2 = float(np.sum(dt_s[(pct_max >= 0.60) & (pct_max < 0.70)]))
    z3 = float(np.sum(dt_s[(pct_max >= 0.70) & (pct_max < 0.80)]))
    z4 = float(np.sum(dt_s[(pct_max >= 0.80) & (pct_max < 0.90)]))
    z5 = float(np.sum(dt_s[(pct_max >= 0.90)]))
    
    duration = float(np.sum(dt_s))
    avg_hr_pct = float(np.mean(pct_max) * 100)
    
    # Quality: how much of the session has valid HR
    valid_fraction = float(np.sum(hr["hr_bpm"] > 0) / len(hr))
    
    return WorkloadResult(
        trimp_banister=trimp,
        duration_s=int(duration),
        time_z1_s=int(z1),
        time_z2_s=int(z2),
        time_z3_s=int(z3),
        time_z4_s=int(z4),
        time_z5_s=int(z5),
        avg_hr_pct=avg_hr_pct,
        quality=valid_fraction,
    )


def _empty_result():
    return WorkloadResult(0, 0, 0, 0, 0, 0, 0, 0.0, 0.0)
```

## Per-horse calibration

V.0 uses default `HRmax=225, HRrest=32`. V.1 will:
1. Track per-horse `hr_observed_max` from session data
2. Per-horse `hr_observed_rest` from rest_stall sessions  
3. Override defaults when at least 30 sessions of data exist

Until then, document that per-horse comparisons within the same horse are valid; cross-horse comparisons need a confidence interval.

## Tests

```python
# tests/unit/test_trimp_zones.py

def test_zero_workload_at_rest_hr():
    """A horse at HRrest produces TRIMP=0 (or near it)."""
    hr = pd.DataFrame({"t_ms": np.arange(0, 60_000, 1000),
                       "hr_bpm": np.full(60, 32.0)})
    r = compute(hr)
    assert r.trimp_banister < 0.5

def test_zone_buckets_sum_to_duration():
    """Zone times should sum to within ε of total duration."""
    hr = pd.DataFrame({
        "t_ms": np.arange(0, 600_000, 1000),
        "hr_bpm": np.linspace(60, 200, 600),  # ramp test
    })
    r = compute(hr)
    zone_sum = r.time_z1_s + r.time_z2_s + r.time_z3_s + r.time_z4_s + r.time_z5_s
    # Some samples will be < 50% HRmax → not bucketed → expected
    assert zone_sum <= r.duration_s

def test_higher_hr_produces_higher_trimp():
    """A constant 180 bpm session has higher TRIMP than a constant 120 bpm session."""
    df_low  = pd.DataFrame({"t_ms": np.arange(0, 600_000, 1000), "hr_bpm": np.full(600, 120)})
    df_high = pd.DataFrame({"t_ms": np.arange(0, 600_000, 1000), "hr_bpm": np.full(600, 180)})
    assert compute(df_high).trimp_banister > compute(df_low).trimp_banister * 2.5
```

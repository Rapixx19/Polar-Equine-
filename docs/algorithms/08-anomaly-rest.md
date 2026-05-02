# algorithms/08 · Anomaly Flagging in Rest

## Feature scope

Identify resting sessions where HR or HRV deviates meaningfully from the horse's own historical baseline. A welfare early-warning layer.

V.0 limitation: H10 only runs while strapped on, so we don't have continuous baseline. We compute baselines from past `rest_*` sessions of the same horse.

## Public interface

```python
# algorithms/anomaly_rest.py

from dataclasses import dataclass
import numpy as np
import pandas as pd

@dataclass
class AnomalyConfig:
    min_baseline_sessions: int = 5         # need at least this much history
    z_threshold_warn: float = 2.0          # 2σ → "watch"
    z_threshold_alert: float = 3.0         # 3σ → "alert"
    decay_lambda: float = 0.92             # EWMA: recent sessions weight more

@dataclass
class AnomalyFlag:
    metric: str                            # 'resting_hr' | 'rmssd'
    severity: str                          # 'watch' | 'alert'
    observed: float
    baseline_mean: float
    baseline_sd: float
    z_score: float
    n_baseline: int
    suggested_action: str

def evaluate(
    horse_id: str,
    current_metrics,                       # SessionMetricsRow for the rest session
    history: pd.DataFrame,                 # prior rest-session metrics for this horse
    config: AnomalyConfig = AnomalyConfig(),
) -> list[AnomalyFlag]:
    """
    Compare current rest session metrics to the horse's own historical baseline.
    Flag deviations beyond z=2 (watch) or z=3 (alert).
    
    Approach:
    - Use exponentially-weighted baseline (recent sessions weighted higher)
    - Two metrics monitored: resting HR (hr_avg in this rest session) and RMSSD
    - Why these: most sensitive to fever, dehydration, sub-clinical illness, pain
    
    What this CAN catch:
    - Elevated resting HR (fever, infection, pain, dehydration)
    - Suppressed RMSSD (autonomic stress, illness onset)
    - Stable abnormal pattern across multiple rest sessions
    
    What this CANNOT catch (V.0 limitation, fixed in V.1 with continuous wear):
    - Acute changes between sessions
    - Sleep-state anomalies
    - Brief transient events
    
    References:
    - Whitney 2014 Equine Vet Educ 26:485 (resting HR as health indicator)
    - Schmitt 2013 Eur J Appl Physiol 113:175 (RMSSD as illness early-warning)
    """
    if len(history) < config.min_baseline_sessions:
        return []
    
    flags = []
    
    # Resting HR check
    if current_metrics.hr_avg > 0:
        baseline_hr_mean, baseline_hr_sd = _ewma_baseline(
            history["hr_avg"].values, config.decay_lambda
        )
        if baseline_hr_sd > 0:
            z = (current_metrics.hr_avg - baseline_hr_mean) / baseline_hr_sd
            severity = _severity(z, config)
            if severity:
                flags.append(AnomalyFlag(
                    metric="resting_hr",
                    severity=severity,
                    observed=current_metrics.hr_avg,
                    baseline_mean=baseline_hr_mean,
                    baseline_sd=baseline_hr_sd,
                    z_score=float(z),
                    n_baseline=len(history),
                    suggested_action=_action_hr(z, severity),
                ))
    
    # RMSSD check
    if current_metrics.rmssd_ms is not None:
        rmssd_history = history["rmssd_ms"].dropna().values
        if len(rmssd_history) >= config.min_baseline_sessions:
            baseline_mean, baseline_sd = _ewma_baseline(rmssd_history, config.decay_lambda)
            if baseline_sd > 0:
                z = (current_metrics.rmssd_ms - baseline_mean) / baseline_sd
                # For RMSSD, only DROPS are concerning (suppression flags stress)
                if z < 0:
                    severity = _severity(abs(z), config)
                    if severity:
                        flags.append(AnomalyFlag(
                            metric="rmssd",
                            severity=severity,
                            observed=current_metrics.rmssd_ms,
                            baseline_mean=baseline_mean,
                            baseline_sd=baseline_sd,
                            z_score=float(z),
                            n_baseline=len(rmssd_history),
                            suggested_action=_action_rmssd(z, severity),
                        ))
    
    return flags


def _ewma_baseline(values, decay_lambda):
    """Exponentially-weighted mean and SD."""
    if len(values) == 0:
        return 0.0, 0.0
    weights = np.array([decay_lambda ** (len(values) - 1 - i) for i in range(len(values))])
    weights /= weights.sum()
    mean = float(np.sum(values * weights))
    var = float(np.sum(weights * (values - mean) ** 2))
    return mean, float(np.sqrt(var))


def _severity(z_abs, config):
    if z_abs >= config.z_threshold_alert:
        return "alert"
    if z_abs >= config.z_threshold_warn:
        return "watch"
    return None


def _action_hr(z, severity):
    if severity == "alert":
        return "Vet check today. Resting HR is significantly elevated."
    return "Monitor next 24h. Possible early sign of illness or stress."


def _action_rmssd(z, severity):
    if severity == "alert":
        return "Reduce workload. Autonomic stress markers significantly suppressed."
    return "Watch for additional signs. Recovery may be incomplete."
```

## Where flags surface

Flags are written to a new table `anomaly_flags` (add a 007 migration):

```sql
create table anomaly_flags (
  id          uuid primary key default gen_random_uuid(),
  horse_id    uuid references horses(id),
  session_id  uuid references sessions(id),
  metric      text not null,
  severity    text not null,
  observed    real,
  baseline_mean real,
  baseline_sd real,
  z_score     real,
  suggested_action text,
  created_at  timestamptz default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references rider_profiles(id)
);
```

In the admin Today screen (`web/05-admin-today.md`), unacknowledged flags appear in a top-of-page banner.

## Tests

```python
# tests/unit/test_anomaly_rest.py

def test_no_flags_with_insufficient_history():
    history = pd.DataFrame({"hr_avg": [32, 33], "rmssd_ms": [180, 175]})
    current = make_metrics(hr_avg=45, rmssd_ms=120)
    flags = evaluate("horse-1", current, history)
    assert flags == []

def test_alerts_on_elevated_resting_hr():
    history = pd.DataFrame({
        "hr_avg": np.full(20, 32) + np.random.normal(0, 1, 20),
        "rmssd_ms": np.full(20, 180) + np.random.normal(0, 10, 20),
    })
    current = make_metrics(hr_avg=42, rmssd_ms=170)  # 10 bpm above baseline
    flags = evaluate("horse-1", current, history)
    hr_flags = [f for f in flags if f.metric == "resting_hr"]
    assert len(hr_flags) == 1
    assert hr_flags[0].severity in ("watch", "alert")

def test_no_flag_for_elevated_rmssd():
    """Higher RMSSD = better autonomic state, not concerning."""
    history = pd.DataFrame({
        "hr_avg": np.full(20, 32),
        "rmssd_ms": np.full(20, 150),
    })
    current = make_metrics(hr_avg=32, rmssd_ms=250)  # well above baseline
    flags = evaluate("horse-1", current, history)
    rmssd_flags = [f for f in flags if f.metric == "rmssd"]
    assert rmssd_flags == []
```

## V.1 expansion

With continuous wear, this module evolves to:
- Continuous baseline (24-hour rolling)
- Sleep-state baselines separately tracked
- Resting respiratory rate from barometer
- Skin-temperature deviation
- Multivariate anomaly score (combine all signals)

The function signature stays the same; only `evaluate` internals expand.

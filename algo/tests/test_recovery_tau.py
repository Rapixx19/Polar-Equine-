"""Tests for algorithms.recovery_tau.

Synthetic τ=80s decay verifies the curve fit recovers the true τ within ±10s.
Failure-path tests cover three-state ``fit_quality`` semantics (None vs 0.0 vs
(0,1]) per the spec's ``recovery_fit_quality`` column comment in migration 016.
"""

from __future__ import annotations

import numpy as np
import pytest
from numpy.typing import NDArray

from algorithms.recovery_tau import (
    MIN_SAMPLES,
    RecoveryConfig,
    RecoveryResult,
    fit,
)
from algorithms.version import algo_version


def _decay(
    tau_s: float, peak: float = 180.0, baseline: float = 40.0, secs: int = 300
) -> tuple[NDArray[np.float64], NDArray[np.int64]]:
    """Build a clean exponential-decay HR trace at 1 Hz."""
    t = np.arange(0, secs * 1000, 1000, dtype=np.int64)
    hr = baseline + (peak - baseline) * np.exp(-t.astype(np.float64) / 1000.0 / tau_s)
    return hr.astype(np.float64), t


def test_fit_recovers_tau_within_tolerance() -> None:
    hr, t = _decay(tau_s=80.0)
    r = fit(hr, t)
    assert r.reason == "ok"
    assert r.tau_s is not None
    assert abs(r.tau_s - 80.0) < 10.0
    assert 0.0 < r.fit_quality <= 1.0
    assert r.algo_version == algo_version


def test_three_state_quality_on_success() -> None:
    """Successful fit: tau_s is float, fit_quality in (0, 1]."""
    hr, t = _decay(tau_s=60.0)
    r = fit(hr, t)
    assert r.reason == "ok"
    assert isinstance(r.tau_s, float)
    assert 0.0 < r.fit_quality <= 1.0


def test_three_state_quality_on_failure_is_zero_not_none() -> None:
    """Attempted-but-failed: tau_s=None, fit_quality=0.0 (NOT None)."""
    # Flat HR — no peak, no decay.
    t = np.arange(0, 60 * 1000, 1000, dtype=np.int64)
    hr = np.full(60, 60.0, dtype=np.float64)
    r = fit(hr, t)
    assert r.tau_s is None
    assert r.fit_quality == 0.0  # Critical: 0.0, not None.
    assert isinstance(r.fit_quality, float)


def test_no_peak_when_below_min_samples() -> None:
    t = np.arange(0, 10 * 1000, 1000, dtype=np.int64)
    hr = np.full(10, 100.0, dtype=np.float64)
    r = fit(hr, t)
    assert r.reason == "no_peak"
    assert r.tau_s is None
    assert r.fit_quality == 0.0
    assert r.n_samples == 10


def test_no_decay_when_drop_below_threshold() -> None:
    # Peak 100 → baseline 90 = 10 bpm drop, below default min_decay_drop_bpm=20.
    hr, t = _decay(tau_s=80.0, peak=100.0, baseline=90.0, secs=300)
    r = fit(hr, t)
    assert r.reason == "no_decay"
    assert r.tau_s is None
    assert r.fit_quality == 0.0


def test_no_decay_when_window_too_short() -> None:
    # Peak at end of trace → decay window has <2 samples or <60 s span.
    secs = 60
    t = np.arange(0, secs * 1000, 1000, dtype=np.int64)
    hr = np.linspace(40.0, 180.0, secs, dtype=np.float64)  # ramp UP, peak at end
    r = fit(hr, t)
    assert r.reason == "no_decay"
    assert r.tau_s is None
    assert r.fit_quality == 0.0


def test_dropout_during_decay_rejects_fit() -> None:
    # Build a decay with a >10 s gap in the original timestamps inside the
    # decay window. Linear interp would smooth over it and bias τ.
    tau = 80.0
    base, peak = 40.0, 180.0
    t_pre = np.arange(0, 30 * 1000, 1000, dtype=np.int64)
    # 20-second gap from t=30 to t=50 (no samples in [30..50]).
    t_post = np.arange(50 * 1000, 300 * 1000, 1000, dtype=np.int64)
    t = np.concatenate([t_pre, t_post]).astype(np.int64)
    hr = base + (peak - base) * np.exp(-t.astype(np.float64) / 1000.0 / tau)
    r = fit(hr.astype(np.float64), t)
    assert r.reason == "dropout_during_decay"
    assert r.tau_s is None
    assert r.fit_quality == 0.0


def test_mismatched_lengths_raises() -> None:
    hr = np.zeros(50, dtype=np.float64)
    t = np.zeros(40, dtype=np.int64)
    with pytest.raises(ValueError, match="equal length"):
        fit(hr, t)


def test_sort_invariance() -> None:
    """Shuffled input timestamps must yield the same fit as sorted input."""
    hr, t = _decay(tau_s=80.0)
    rng = np.random.default_rng(42)
    perm = rng.permutation(hr.size)
    r_sorted = fit(hr, t)
    r_shuffled = fit(hr[perm], t[perm])
    assert r_sorted.reason == r_shuffled.reason == "ok"
    assert r_sorted.tau_s is not None and r_shuffled.tau_s is not None
    assert abs(r_sorted.tau_s - r_shuffled.tau_s) < 0.5


def test_custom_config_tightens_min_drop() -> None:
    # Default min_decay_drop_bpm=20 would accept a 25-bpm drop; tightening to
    # 30 forces no_decay.
    hr, t = _decay(tau_s=80.0, peak=80.0, baseline=55.0, secs=300)  # 25 bpm drop
    cfg = RecoveryConfig(min_decay_drop_bpm=30)
    r = fit(hr, t, cfg)
    assert r.reason == "no_decay"


def test_diagnostics_populated_on_success() -> None:
    hr, t = _decay(tau_s=80.0)
    r = fit(hr, t)
    assert r.hr_peak_bpm is not None and r.hr_peak_bpm > 170.0
    assert r.hr_baseline_bpm is not None and 30.0 < r.hr_baseline_bpm < 60.0
    assert r.rmse_bpm is not None and r.rmse_bpm >= 0.0
    assert r.n_samples > 0


def test_min_samples_threshold_matches_hrv() -> None:
    """Spec :64 — recovery uses the same MIN_SAMPLES floor as HRV (=30)."""
    assert MIN_SAMPLES == 30


def test_result_is_frozen() -> None:
    hr, t = _decay(tau_s=80.0)
    r = fit(hr, t)
    with pytest.raises((AttributeError, TypeError)):
        r.tau_s = 999.0  # type: ignore[misc]


def test_failure_result_carries_peak_diagnostic() -> None:
    """When the algo gets far enough to detect a peak, peak_hr is surfaced."""
    hr, t = _decay(tau_s=80.0, peak=100.0, baseline=90.0, secs=300)  # no_decay
    r = fit(hr, t)
    assert r.reason == "no_decay"
    assert r.hr_peak_bpm is not None
    assert r.hr_peak_bpm > 95.0


def test_returns_recovery_result_dataclass() -> None:
    hr, t = _decay(tau_s=80.0)
    assert isinstance(fit(hr, t), RecoveryResult)

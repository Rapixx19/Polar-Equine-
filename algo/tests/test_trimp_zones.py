"""Tests for algorithms.trimp_zones.

Spec source: docs/algorithms/05-trimp-zones.md (the spec ships pandas-based
test snippets at :131-153; we re-cast them onto the NDArray API and add
explicit edge cases for dropouts + invariants).
"""

from __future__ import annotations

import numpy as np
import pytest

from algorithms.trimp_zones import (
    HR_PHYSIO_MAX,
    HR_PHYSIO_MIN,
    WorkloadConfig,
    WorkloadResult,
    compute,
)
from algorithms.version import algo_version


def _hr_at(seconds: int, hr: float) -> tuple[np.ndarray, np.ndarray]:
    """Build parallel (hr_bpm, t_ms) arrays at 1 Hz for ``seconds`` of flat HR."""
    t_ms = np.arange(0, seconds * 1000, 1000, dtype=np.int64)
    hr_bpm = np.full(seconds, hr, dtype=np.float64)
    return hr_bpm, t_ms


# Spec :131-136 — A horse at HR_rest produces TRIMP near zero.
def test_zero_workload_at_rest_hr() -> None:
    hr, t = _hr_at(60, 32.0)
    r = compute(hr, t)
    assert r.trimp_banister < 0.5
    # Flat 32 bpm: passes physio filter (≥30), avg_pct = 32/225 ≈ 0.142.
    assert r.quality == 1.0
    assert r.n_dropped == 0


def test_zone_buckets_sum_le_total_duration() -> None:
    # Spec :138-147 — 10-min ramp 60→200 bpm. Some samples below Z1 floor (50% of
    # 225 = 112.5 bpm) → bucketed sum < total. We assert <= total + the cap.
    seconds = 600
    t = np.arange(0, seconds * 1000, 1000, dtype=np.int64)
    hr = np.linspace(60.0, 200.0, seconds, dtype=np.float64)
    r = compute(hr, t)
    zone_sum = r.time_z1_s + r.time_z2_s + r.time_z3_s + r.time_z4_s + r.time_z5_s
    assert 0 < zone_sum <= seconds


def test_higher_hr_produces_higher_trimp() -> None:
    # Spec :149-153 — 10 min at 180 bpm > 2.5x the TRIMP of 10 min at 120 bpm.
    hr_low, t_low = _hr_at(600, 120.0)
    hr_high, t_high = _hr_at(600, 180.0)
    r_low = compute(hr_low, t_low)
    r_high = compute(hr_high, t_high)
    assert r_high.trimp_banister > r_low.trimp_banister * 2.5


def test_all_z1_session_populates_only_z1() -> None:
    # 60 bpm → 60/225 ≈ 0.267 — below 50% Z1 floor. Use 130 bpm (130/225 ≈ 0.578).
    hr, t = _hr_at(600, 130.0)
    r = compute(hr, t)
    assert r.time_z1_s > 580  # ~600s minus the leading dt=0 sample
    assert r.time_z2_s == 0
    assert r.time_z3_s == 0
    assert r.time_z4_s == 0
    assert r.time_z5_s == 0


def test_z5_open_ended_includes_above_hrmax() -> None:
    # 230 bpm > HR_max=225 → pct_max > 1.0 → still falls in Z5 (≥0.90).
    # Note: 230 is above HR_PHYSIO_MAX=220 so it's dropped from quality but
    # NOT from zone bucketing (zones use raw HR per spec :86-92).
    hr, t = _hr_at(120, 230.0)
    r = compute(hr, t)
    assert r.time_z5_s > 0
    assert r.quality < 1.0  # 230 outside [30,220]
    assert r.n_dropped == 120


def test_dropout_zeros_excluded_from_quality() -> None:
    # 120s session: 100s at 150 bpm + 20s of HR=0 dropouts. Quality = 100/120.
    seconds = 120
    t = np.arange(0, seconds * 1000, 1000, dtype=np.int64)
    hr = np.full(seconds, 150.0, dtype=np.float64)
    hr[100:] = 0.0  # 20 dropout samples
    r = compute(hr, t)
    assert r.quality == pytest.approx(100 / 120, abs=1e-6)
    assert r.n_dropped == 20
    # HR=0 → pct_hrr=0 → no contribution to TRIMP. Zones: 0/225=0 < Z1 floor.
    # avg_hr_pct uses only the 100 valid samples → 150/225 ≈ 0.667.
    assert r.avg_hr_pct == pytest.approx(150.0 / 225.0, abs=1e-6)


def test_empty_input_returns_zero_result() -> None:
    r = compute(np.array([], dtype=np.float64), np.array([], dtype=np.int64))
    assert r.trimp_banister == 0.0
    assert r.quality == 0.0
    assert r.n_dropped == 0
    for s in (r.time_z1_s, r.time_z2_s, r.time_z3_s, r.time_z4_s, r.time_z5_s):
        assert s == 0


def test_mismatched_lengths_raises() -> None:
    with pytest.raises(ValueError, match="equal length"):
        compute(
            np.array([100.0, 110.0], dtype=np.float64),
            np.array([0], dtype=np.int64),
        )


def test_unsorted_timestamps_get_sorted() -> None:
    # Reverse-order input must produce the same result as sorted input.
    hr_sorted, t_sorted = _hr_at(120, 150.0)
    hr_rev = hr_sorted[::-1].copy()
    t_rev = t_sorted[::-1].copy()
    r_sorted = compute(hr_sorted, t_sorted)
    r_rev = compute(hr_rev, t_rev)
    assert r_sorted.trimp_banister == pytest.approx(r_rev.trimp_banister)
    assert r_sorted.time_z3_s == r_rev.time_z3_s


def test_gap_cap_prevents_inflation() -> None:
    # Two samples 10 minutes apart at 180 bpm. Without the 30s cap, a single
    # gap would contribute 600s to Z4. With the cap, contribution is 30s.
    t = np.array([0, 600_000], dtype=np.int64)
    hr = np.array([180.0, 180.0], dtype=np.float64)
    r = compute(hr, t)
    # 180/225 = 0.8 → Z4 lower bound. Z4 ranges [0.80, 0.90), so 0.80 is in Z4.
    assert r.time_z4_s == 30  # capped, not 600


def test_algo_version_propagates() -> None:
    hr, t = _hr_at(60, 100.0)
    r = compute(hr, t)
    assert r.algo_version == algo_version


def test_custom_config_overrides_defaults() -> None:
    # Lower HR_max → higher %HRr → higher TRIMP for the same input.
    hr, t = _hr_at(600, 150.0)
    default = compute(hr, t)
    custom = compute(hr, t, WorkloadConfig(hr_max_bpm=180.0))
    assert custom.trimp_banister > default.trimp_banister


def test_physio_constants_within_horse_range() -> None:
    # Sanity: physiological bounds bracket plausible equine HR.
    assert HR_PHYSIO_MIN == 30.0
    assert HR_PHYSIO_MAX == 220.0


def test_result_is_frozen() -> None:
    hr, t = _hr_at(60, 100.0)
    r = compute(hr, t)
    assert isinstance(r, WorkloadResult)
    with pytest.raises((AttributeError, Exception)):
        r.trimp_banister = 999.0  # type: ignore[misc]

"""Tests for algorithms.jump_detector.

We synthesise a quiet baseline plus a short, large impulse on the vertical
axis and assert the detector emits one event whose [start_ms, end_ms] brackets
the truth window. Spurious 1-sample blips and sustained high-RMS canter
stretches are also exercised — both must NOT be reported as jumps.
"""

from __future__ import annotations

import numpy as np
import pytest

from algorithms.jump_detector import (
    CLUSTER_GAP_SEC,
    MAX_DURATION_SEC,
    MIN_PEAK_G,
    detect,
)
from algorithms.version import algo_version


def _takeoff_landing(
    az: np.ndarray,
    *,
    sr_hz: float = 52.0,
    t0_s: float = 15.0,
    impulse_g: float = 1.5,
) -> None:
    """In-place stamp a real-jump pattern on az: 200 ms takeoff bump, 300 ms
    suspension valley (no boost), 200 ms landing bump. Total run is ~700 ms
    after the detector's merge_gap merges the two impulses."""
    a = int(t0_s * sr_hz)
    b = a + int(0.2 * sr_hz)
    c = b + int(0.3 * sr_hz)
    d = c + int(0.2 * sr_hz)
    az[a:b] += impulse_g
    az[c:d] += impulse_g


def _baseline(
    duration_s: float, sr_hz: float = 52.0, seed: int = 7
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    n = round(duration_s * sr_hz)
    t = np.arange(n) / sr_hz
    timestamps = (t * 1000).astype(np.int64)
    rng = np.random.default_rng(seed)
    az = 1.0 + rng.normal(0.0, 0.02, n)
    ax = rng.normal(0.0, 0.02, n)
    ay = rng.normal(0.0, 0.02, n)
    return timestamps, ax.astype(np.float64), ay.astype(np.float64), az.astype(np.float64)


def test_empty_input_returns_empty_result() -> None:
    empty_i = np.array([], dtype=np.int64)
    empty_f = np.array([], dtype=np.float64)
    result = detect(empty_i, empty_f, empty_f, empty_f)
    assert result.events == ()
    assert result.sample_rate_hz == 52.0
    assert result.algo_version == algo_version


def test_quiet_baseline_yields_no_events() -> None:
    t, ax, ay, az = _baseline(duration_s=20)
    result = detect(t, ax, ay, az)
    assert result.events == ()


def test_takeoff_landing_pair_is_detected() -> None:
    """Real jump signature: takeoff impulse → suspension valley → landing impulse.
    The merge gap fuses the two bumps; the suspension gate sees the quiet middle."""
    t, ax, ay, az = _baseline(duration_s=30)
    _takeoff_landing(az, t0_s=15.0)
    result = detect(t, ax, ay, az)
    assert len(result.events) == 1
    event = result.events[0]
    assert event.start_ms >= int(14.5 * 1000)
    assert event.end_ms <= int(16.5 * 1000)
    assert event.peak_g >= MIN_PEAK_G
    assert 0.0 <= event.confidence <= 1.0


def test_single_sustained_impulse_rejected_by_suspension_gate() -> None:
    """A solid 500 ms +1.5 g impulse with NO suspension valley is no longer a
    jump. Real take-off/landing physics demands a free-fall middle."""
    t, ax, ay, az = _baseline(duration_s=30)
    sr_hz = 52.0
    a = int(15 * sr_hz)
    b = a + int(0.5 * sr_hz)
    az[a:b] += 1.5  # impulse without a suspension valley
    result = detect(t, ax, ay, az)
    assert result.events == ()


def test_low_magnitude_burst_rejected_by_peak_g_floor() -> None:
    """Tall-z but low-magnitude bumps (sub-1.5 g) are rejected — z alone can fire
    on tiny excursions during very quiet baselines."""
    t, ax, ay, az = _baseline(duration_s=30, seed=3)
    sr_hz = 52.0
    a = int(15 * sr_hz)
    b = a + int(0.2 * sr_hz)
    c = b + int(0.3 * sr_hz)
    d = c + int(0.2 * sr_hz)
    # 0.8 g bumps: easily clear 4 stddev on the 0.02 g noise baseline but
    # below MIN_PEAK_G = 1.5.
    az[a:b] += 0.8
    az[c:d] += 0.8
    result = detect(t, ax, ay, az)
    assert result.events == ()


def test_single_sample_spike_filtered_as_emi() -> None:
    t, ax, ay, az = _baseline(duration_s=20)
    # 1-sample spike — below MIN_DURATION_SEC.
    az[10 * 52] += 5.0
    result = detect(t, ax, ay, az)
    assert result.events == ()


def test_repeated_takeoff_landing_clustered_to_one_per_3s() -> None:
    """Two real jumps 1.5 s apart cluster down to one detection — typical of a
    classifier double-firing on take-off + landing within a single jump."""
    t, ax, ay, az = _baseline(duration_s=30)
    _takeoff_landing(az, t0_s=15.0)
    _takeoff_landing(az, t0_s=16.5)  # 1.5 s after first → within CLUSTER_GAP_SEC
    result = detect(t, ax, ay, az)
    assert len(result.events) == 1


def test_two_genuine_jumps_outside_cluster_window_both_kept() -> None:
    """Jumps spaced wider than CLUSTER_GAP_SEC stay as separate detections."""
    t, ax, ay, az = _baseline(duration_s=40)
    _takeoff_landing(az, t0_s=10.0)
    _takeoff_landing(az, t0_s=10.0 + CLUSTER_GAP_SEC + 2.0)
    result = detect(t, ax, ay, az)
    assert len(result.events) == 2


def test_sustained_high_rms_canter_not_reported_as_jump() -> None:
    # A long stretch above threshold should be classed as gait, not a jump.
    # Duration well above MAX_DURATION_SEC.
    n = 20 * 52
    t = (np.arange(n) / 52.0 * 1000).astype(np.int64)
    sustained_start = 5 * 52
    sustained_end = int((5 + MAX_DURATION_SEC + 2.0) * 52)
    rng = np.random.default_rng(11)
    az = 1.0 + rng.normal(0.0, 0.02, n)
    az[sustained_start:sustained_end] += 1.5
    ax = rng.normal(0.0, 0.02, n)
    ay = rng.normal(0.0, 0.02, n)
    result = detect(t, ax.astype(np.float64), ay.astype(np.float64), az.astype(np.float64))
    assert result.events == ()


def test_two_close_impulses_merge_into_one() -> None:
    # Take-off and landing pair: two 200 ms bumps 300 ms apart should fuse,
    # and the 300 ms quiet middle should pass the suspension gate.
    t, ax, ay, az = _baseline(duration_s=30)
    _takeoff_landing(az, t0_s=15.0)
    result = detect(t, ax, ay, az)
    assert len(result.events) == 1


def test_mismatched_array_lengths_raises() -> None:
    t = np.array([0, 1000], dtype=np.int64)
    ax = np.zeros(3, dtype=np.float64)
    with pytest.raises(ValueError, match="equal length"):
        detect(t, ax, np.zeros(2, dtype=np.float64), np.zeros(2, dtype=np.float64))


def test_too_short_returns_empty_without_raising() -> None:
    # <8 s with default 8 s baseline can't run; expect empty, not raise.
    t, ax, ay, az = _baseline(duration_s=2.0)
    result = detect(t, ax, ay, az)
    assert result.events == ()

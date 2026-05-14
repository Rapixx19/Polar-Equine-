"""Tests for algorithms.gait_classifier.

We synthesise a vertical-bounce signal at known stride frequencies and assert
the classifier emits the expected gait label. The fixture builds tri-axial
ACC where ``az ≈ 1g + A·sin(2π·f·t)`` and ``ax, ay`` carry small noise; the
gravity-removed magnitude then oscillates at ``f``, which is exactly what the
girth-strap sees in the real world.
"""

from __future__ import annotations

import numpy as np
import pytest

from algorithms.gait_classifier import classify
from algorithms.version import algo_version


def _synth_acc(
    duration_s: float,
    stride_hz: float,
    amplitude_g: float,
    sr_hz: float = 52.0,
    seed: int = 1,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    n = round(duration_s * sr_hz)
    t = np.arange(n) / sr_hz
    timestamps = (t * 1000).astype(np.int64)
    rng = np.random.default_rng(seed)
    az = 1.0 + amplitude_g * np.sin(2 * np.pi * stride_hz * t)
    ax = rng.normal(0.0, 0.01, n)
    ay = rng.normal(0.0, 0.01, n)
    return timestamps, ax.astype(np.float64), ay.astype(np.float64), az.astype(np.float64)


def test_empty_input_returns_empty_result() -> None:
    empty_i = np.array([], dtype=np.int64)
    empty_f = np.array([], dtype=np.float64)
    result = classify(empty_i, empty_f, empty_f, empty_f)
    assert result.segments == ()
    assert result.n_windows == 0
    assert result.sample_rate_hz == 52.0
    assert result.algo_version == algo_version


def test_walk_band_one_hz() -> None:
    t, ax, ay, az = _synth_acc(duration_s=20, stride_hz=1.0, amplitude_g=0.3)
    result = classify(t, ax, ay, az)
    labels = {s.label for s in result.segments}
    assert "walk" in labels


def test_trot_band_two_hz() -> None:
    t, ax, ay, az = _synth_acc(duration_s=20, stride_hz=2.0, amplitude_g=0.5)
    result = classify(t, ax, ay, az)
    labels = {s.label for s in result.segments}
    assert "trot" in labels


def test_canter_band_three_hz() -> None:
    t, ax, ay, az = _synth_acc(duration_s=20, stride_hz=3.0, amplitude_g=0.7)
    result = classify(t, ax, ay, az)
    labels = {s.label for s in result.segments}
    assert "canter_gallop" in labels


def test_rest_when_signal_is_still() -> None:
    # No motion: az = 1g exactly, tiny noise. RMS stays well below REST_RMS_G.
    n = round(20 * 52.0)
    t = (np.arange(n) / 52.0 * 1000).astype(np.int64)
    az = np.full(n, 1.0, dtype=np.float64)
    ax = np.zeros(n, dtype=np.float64)
    ay = np.zeros(n, dtype=np.float64)
    result = classify(t, ax, ay, az)
    labels = {s.label for s in result.segments}
    assert labels == {"rest"} or labels == set()


def test_too_short_window_returns_empty() -> None:
    t, ax, ay, az = _synth_acc(duration_s=1.0, stride_hz=2.0, amplitude_g=0.5)
    result = classify(t, ax, ay, az)
    assert result.segments == ()
    assert result.n_windows == 0


def test_mismatched_array_lengths_raises() -> None:
    t = np.array([0, 1000], dtype=np.int64)
    ax = np.array([0.0, 0.0, 0.0], dtype=np.float64)
    with pytest.raises(ValueError, match="equal length"):
        classify(t, ax, np.zeros(2, dtype=np.float64), np.zeros(2, dtype=np.float64))


def test_segments_are_sorted_and_non_overlapping() -> None:
    t, ax, ay, az = _synth_acc(duration_s=30, stride_hz=2.0, amplitude_g=0.5)
    result = classify(t, ax, ay, az)
    starts = [s.start_ms for s in result.segments]
    ends = [s.end_ms for s in result.segments]
    assert starts == sorted(starts)
    for i in range(1, len(result.segments)):
        assert starts[i] >= ends[i - 1]


def test_sample_rate_estimated_from_timestamps() -> None:
    # 100 Hz signal: median dt = 10 ms → sr ≈ 100 Hz.
    t, ax, ay, az = _synth_acc(duration_s=10, stride_hz=2.0, amplitude_g=0.5, sr_hz=100.0)
    result = classify(t, ax, ay, az)
    assert 95.0 <= result.sample_rate_hz <= 105.0

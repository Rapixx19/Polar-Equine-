"""Tests for algorithms.hrv_metrics.

PhysioNet reference: ``tests/fixtures/physionet_nsrdb_16265.json`` is a 5-min
window from PhysioNet NSRDB record 16265 (fs=128 Hz, sampto=38400). Expected
RMSSD/SDNN computed offline from the same window — tolerance ±5% guards
against algorithm drift, not window mismatch. The fixture is human data
(mean RR ~620 ms), so we call ``compute()`` directly rather than through
``rr_cleaning.clean()`` — which uses horse-tuned bounds [800, 3000].
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from algorithms.hrv_metrics import compute
from algorithms.version import algo_version

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "physionet_nsrdb_16265.json"


def test_compute_known_values() -> None:
    # Hand-crafted: 4 RR with diffs = [+10, -10, +10] → RMSSD = sqrt(mean([100,100,100])) = 10.0
    # Repeat to clear MIN_BEATS=30. SDNN of {1000,1010,1000,1010,...} = ~5.0 with ddof=1.
    rr = np.array([1000.0, 1010.0] * 20)  # 40 beats
    result = compute(rr)
    diffs = np.diff(rr)
    expected_rmssd = float(np.sqrt(np.mean(diffs**2)))
    expected_sdnn = float(np.std(rr, ddof=1))
    assert result.rmssd_ms == pytest.approx(expected_rmssd, abs=0.1)
    assert result.sdnn_ms == pytest.approx(expected_sdnn, abs=0.1)
    assert result.mean_rr_ms == pytest.approx(1005.0, abs=0.1)
    assert result.n_beats == 40
    assert result.algo_version == algo_version


def test_compute_pnn50_horse_resting() -> None:
    # Alternating ±80 ms: every diff is 160 ms which clears 50 ms strict-greater.
    rr = np.array([1000.0, 1160.0] * 30)  # 60 beats, 59 diffs
    result = compute(rr)
    assert result.pnn50_pct == pytest.approx(100.0, abs=0.1)


def test_compute_pnn20_horse_resting() -> None:
    rr = np.array([1000.0, 1160.0] * 30)
    result = compute(rr)
    assert result.pnn20_pct == pytest.approx(100.0, abs=0.1)


def test_compute_quality_short_series() -> None:
    rng = np.random.default_rng(3)
    rr = 1000.0 + rng.normal(0.0, 5.0, size=40)
    result = compute(rr)
    assert result.quality == pytest.approx(40.0 / 60.0, abs=1e-9)


def test_compute_quality_caps_at_1() -> None:
    rng = np.random.default_rng(5)
    rr = 1000.0 + rng.normal(0.0, 5.0, size=120)
    result = compute(rr)
    assert result.quality == pytest.approx(1.0)


def test_compute_raises_below_30_beats() -> None:
    rng = np.random.default_rng(9)
    rr = 1000.0 + rng.normal(0.0, 5.0, size=29)
    with pytest.raises(ValueError, match="insufficient_data"):
        compute(rr)


def test_compute_physionet_reference_within_5pct() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text())
    rr = np.array(fixture["rr_ms"], dtype=float)
    result = compute(rr)
    expected_rmssd = float(fixture["expected_rmssd_ms"])
    expected_sdnn = float(fixture["expected_sdnn_ms"])
    assert abs(result.rmssd_ms - expected_rmssd) / expected_rmssd <= 0.05
    assert abs(result.sdnn_ms - expected_sdnn) / expected_sdnn <= 0.05

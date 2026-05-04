"""Tests for algorithms.rr_cleaning."""

from __future__ import annotations

import numpy as np
import pytest

from algorithms.rr_cleaning import CleaningConfig, clean
from algorithms.version import algo_version


def test_clean_returns_unchanged_for_clean_input() -> None:
    rng = np.random.default_rng(42)
    rr = 1000.0 + rng.normal(0.0, 2.0, size=120)
    result = clean(rr)
    assert result.n_corrected == 0
    assert result.quality == pytest.approx(1.0)
    assert result.algo_version == algo_version
    assert result.rr_clean_ms.shape == rr.shape


def test_clean_corrects_ectopic_beats() -> None:
    rng = np.random.default_rng(7)
    rr = 1000.0 + rng.normal(0.0, 20.0, size=120)
    rr[20] = 400.0
    rr[21] = 1600.0
    rr[60] = 350.0
    rr[61] = 1650.0
    rr[100] = 380.0
    rr[101] = 1620.0
    result = clean(rr)
    assert result.n_corrected > 0
    assert result.quality < 1.0
    assert result.quality >= 0.0


def test_clean_preserves_av_block_segments() -> None:
    rr = np.tile([1000.0, 2000.0], 30)
    result = clean(rr)
    assert len(result.av_block_segments) > 0
    np.testing.assert_allclose(result.rr_clean_ms[:10], rr[:10], atol=1.0)


def test_clean_clamps_out_of_range() -> None:
    rng = np.random.default_rng(11)
    rr = 1000.0 + rng.normal(0.0, 5.0, size=80)
    rr[10] = 500.0
    rr[40] = 4000.0
    result = clean(rr)
    assert result.rr_clean_ms[10] >= 800.0
    assert result.rr_clean_ms[40] <= 3000.0
    assert result.n_corrected >= 2


def test_clean_quality_floor_zero() -> None:
    rr = np.full(60, 700.0)
    rr[0] = 1000.0
    result = clean(rr)
    assert result.quality == pytest.approx(0.0, abs=1e-9) or result.quality < 0.05


def test_clean_handles_all_out_of_range_raises() -> None:
    rr = np.full(40, 100.0)
    with pytest.raises(ValueError, match="no_valid_beats"):
        clean(rr)


def test_clean_disable_av_block_flag_means_no_segments() -> None:
    rr = np.tile([1000.0, 2000.0], 30)
    cfg = CleaningConfig(flag_av_block=False)
    result = clean(rr, cfg)
    assert result.av_block_segments == []


def test_clean_empty_raises() -> None:
    with pytest.raises(ValueError, match="no_valid_beats"):
        clean(np.array([], dtype=float))

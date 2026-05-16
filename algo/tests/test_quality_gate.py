"""Unit tests for the HRV plausibility gate (migration 036)."""

from __future__ import annotations

from service.routes._quality_gate import (
    RMSSD_MAX_PLAUSIBLE_MS,
    RR_CLEANING_MIN_QUALITY,
    SDNN_MAX_PLAUSIBLE_MS,
    evaluate_hrv_quality,
)


def test_clean_inputs_pass() -> None:
    """Realistic equine HRV at rest → no flags, hrv_unreliable=False."""
    v = evaluate_hrv_quality(rr_cleaning_quality=0.97, rmssd_ms=120.0, sdnn_ms=95.0)
    assert v.flags == {}
    assert v.hrv_unreliable is False


def test_rr_cleaning_below_threshold_fires() -> None:
    """Below RR_CLEANING_MIN_QUALITY → rr_cleaning_low flag."""
    v = evaluate_hrv_quality(
        rr_cleaning_quality=RR_CLEANING_MIN_QUALITY - 0.01,
        rmssd_ms=120.0,
        sdnn_ms=95.0,
    )
    assert v.flags == {"rr_cleaning_low": True}
    assert v.hrv_unreliable is True


def test_rmssd_implausible_fires() -> None:
    """RMSSD above the equine ceiling → rmssd_implausible flag."""
    v = evaluate_hrv_quality(
        rr_cleaning_quality=0.9, rmssd_ms=RMSSD_MAX_PLAUSIBLE_MS + 1.0, sdnn_ms=95.0
    )
    assert v.flags == {"rmssd_implausible": True}
    assert v.hrv_unreliable is True


def test_sdnn_implausible_fires() -> None:
    v = evaluate_hrv_quality(
        rr_cleaning_quality=0.9, rmssd_ms=120.0, sdnn_ms=SDNN_MAX_PLAUSIBLE_MS + 1.0
    )
    assert v.flags == {"sdnn_implausible": True}
    assert v.hrv_unreliable is True


def test_multiple_flags_aggregate() -> None:
    """Emma's session shape: low cleaning quality AND implausible RMSSD."""
    v = evaluate_hrv_quality(rr_cleaning_quality=0.36, rmssd_ms=747.0, sdnn_ms=613.0)
    assert v.flags == {
        "rr_cleaning_low": True,
        "rmssd_implausible": True,
        "sdnn_implausible": True,
    }
    assert v.hrv_unreliable is True


def test_boundary_equality_is_pass() -> None:
    """Quality exactly at the threshold is NOT flagged (strict <)."""
    v = evaluate_hrv_quality(
        rr_cleaning_quality=RR_CLEANING_MIN_QUALITY, rmssd_ms=120.0, sdnn_ms=95.0
    )
    assert v.flags == {}
    assert v.hrv_unreliable is False

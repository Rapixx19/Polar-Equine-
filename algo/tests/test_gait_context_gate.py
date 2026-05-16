"""Unit tests for the jump gait-context gate in service.routes._gait.

The gate drops jump events that don't overlap a ``canter_gallop`` segment
within ±GAIT_GATE_MARGIN_MS. Tests use the pure helper so we avoid mocking
the data-access layer."""

from __future__ import annotations

from service.routes._gait import GAIT_GATE_MARGIN_MS, _jump_in_canter


def test_jump_inside_canter_kept() -> None:
    canter = [(10_000, 30_000)]
    assert _jump_in_canter(15_000, 15_500, canter) is True


def test_jump_inside_walk_only_dropped() -> None:
    canter: list[tuple[int, int]] = []
    assert _jump_in_canter(15_000, 15_500, canter) is False


def test_jump_just_after_canter_within_margin_kept() -> None:
    """Landing right after the canter segment ends should still count — the
    classifier hops can lag the actual gait change."""
    canter = [(10_000, 30_000)]
    jump_start = 30_500
    jump_end = 31_000
    assert jump_end - 30_000 <= GAIT_GATE_MARGIN_MS
    assert _jump_in_canter(jump_start, jump_end, canter) is True


def test_jump_far_outside_canter_dropped() -> None:
    canter = [(10_000, 30_000)]
    assert _jump_in_canter(60_000, 60_500, canter) is False


def test_jump_overlapping_canter_start_kept() -> None:
    """A jump straddling the start of a canter segment counts — the takeoff
    can happen at the gait transition."""
    canter = [(30_000, 60_000)]
    assert _jump_in_canter(29_500, 30_500, canter) is True


def test_multiple_canter_segments_any_overlap_counts() -> None:
    canter = [(10_000, 15_000), (40_000, 60_000)]
    assert _jump_in_canter(45_000, 45_500, canter) is True
    assert _jump_in_canter(25_000, 25_500, canter) is False

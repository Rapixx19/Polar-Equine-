"""Data-layer unit tests with a synthetic Supabase mock.

Covers the pagination boundary cases (exactly 1000 rows, exactly 999 rows,
multi-page 2500) that would otherwise silently truncate real session data.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from service import data
from service.data_types import SessionMetricsRow


class _MockResponse:
    def __init__(self, rows: list[dict[str, Any]]):
        self.data = rows


class _MockTable:
    """Simulates the chained .select().eq().range().execute() pattern."""

    def __init__(self) -> None:
        self.range_calls: list[tuple[int, int]] = []
        self.insert_calls: list[dict[str, Any]] = []
        self.update_calls: list[dict[str, Any]] = []
        self.delete_called = False
        self._range_pages: list[list[dict[str, Any]]] = []
        self._select_rows: list[dict[str, Any]] = []
        self._insert_raises: Exception | None = None

    def select(self, *_args: Any, **_kwargs: Any) -> _MockTable:
        return self

    def eq(self, *_args: Any, **_kwargs: Any) -> _MockTable:
        return self

    def limit(self, *_args: Any, **_kwargs: Any) -> _MockTable:
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> _MockTable:
        return self

    @property
    def not_(self) -> _MockTable:
        return self

    def is_(self, *_args: Any, **_kwargs: Any) -> _MockTable:
        return self

    def range(self, start: int, end: int) -> _MockTable:
        self.range_calls.append((start, end))
        if self._range_pages:
            self._next_page = self._range_pages.pop(0)
        else:
            self._next_page = []
        return self

    def insert(self, payload: dict[str, Any]) -> _MockTable:
        self.insert_calls.append(payload)
        if self._insert_raises is not None:
            raise self._insert_raises
        return self

    def update(self, payload: dict[str, Any]) -> _MockTable:
        self.update_calls.append(payload)
        return self

    def delete(self) -> _MockTable:
        self.delete_called = True
        return self

    def execute(self) -> _MockResponse:
        if hasattr(self, "_next_page"):
            page, self._next_page = self._next_page, []
            return _MockResponse(page)
        return _MockResponse(self._select_rows)


class _MockClient:
    def __init__(self, table: _MockTable) -> None:
        self._table = table

    def table(self, _name: str) -> _MockTable:
        return self._table


@pytest.fixture(autouse=True)
def reset_singleton() -> None:
    data._client = None


def _patch_client(monkeypatch: pytest.MonkeyPatch, table: _MockTable) -> None:
    monkeypatch.setattr(data, "create_client", lambda _u, _k: _MockClient(table))
    data._client = None


def _hr_row(i: int) -> dict[str, Any]:
    return {"timestamp_ms": i * 1000, "hr_bpm": 35, "rr_ms": 1900}


def test_read_session_returns_dataclass(monkeypatch: pytest.MonkeyPatch) -> None:
    table = _MockTable()
    table._select_rows = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "activity_type": "riding",
            "start_time": "2026-05-04T10:00:00+00:00",
            "end_time": "2026-05-04T10:05:00+00:00",
            "metrics_status": "pending",
        }
    ]
    _patch_client(monkeypatch, table)
    row = data.read_session("00000000-0000-0000-0000-000000000001")
    assert row.activity_type == "riding"
    assert row.metrics_status == "pending"


def test_read_session_lifts_horse_calibration(monkeypatch: pytest.MonkeyPatch) -> None:
    # Migration 038: PostgREST embeds horse calibration as a nested object. We
    # surface it onto SessionRow so the pipeline doesn't double round-trip.
    table = _MockTable()
    table._select_rows = [
        {
            "id": "sid",
            "activity_type": "riding",
            "start_time": "2026-05-04T10:00:00+00:00",
            "end_time": "2026-05-04T10:05:00+00:00",
            "metrics_status": "pending",
            "horse": {"hr_max_bpm": 150, "hr_rest_bpm": 38},
        }
    ]
    _patch_client(monkeypatch, table)
    row = data.read_session("sid")
    assert row.hr_max_bpm == 150
    assert row.hr_rest_bpm == 38


def test_read_session_uncalibrated_horse(monkeypatch: pytest.MonkeyPatch) -> None:
    # Half-calibrated and missing-horse cases must surface NULL, not crash —
    # the pipeline's _workload_config falls back to species defaults per field.
    table = _MockTable()
    table._select_rows = [
        {
            "id": "sid",
            "activity_type": "riding",
            "start_time": "2026-05-04T10:00:00+00:00",
            "end_time": None,
            "metrics_status": "pending",
            "horse": None,
        }
    ]
    _patch_client(monkeypatch, table)
    row = data.read_session("sid")
    assert row.hr_max_bpm is None
    assert row.hr_rest_bpm is None


def test_read_session_raises_on_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    table = _MockTable()
    table._select_rows = []
    _patch_client(monkeypatch, table)
    with pytest.raises(ValueError, match="session_not_found"):
        data.read_session("00000000-0000-0000-0000-000000000099")


def test_read_hr_samples_pagination_at_1000_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """1000 rows on page 1 → loop MUST issue a 2nd .range() call (defends against truncation)."""
    table = _MockTable()
    table._range_pages = [[_hr_row(i) for i in range(1000)], []]
    _patch_client(monkeypatch, table)
    samples = data.read_hr_samples("sid")
    assert samples.rr_ms.size == 1000
    assert len(table.range_calls) == 2
    assert table.range_calls[0] == (0, 999)
    assert table.range_calls[1] == (1000, 1999)


def test_read_hr_samples_pagination_at_999_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """999 rows on page 1 → loop exits; assert mock's .range was called exactly once."""
    table = _MockTable()
    table._range_pages = [[_hr_row(i) for i in range(999)]]
    _patch_client(monkeypatch, table)
    samples = data.read_hr_samples("sid")
    assert samples.rr_ms.size == 999
    assert len(table.range_calls) == 1


def test_read_hr_samples_pagination_multipage(monkeypatch: pytest.MonkeyPatch) -> None:
    table = _MockTable()
    table._range_pages = [
        [_hr_row(i) for i in range(1000)],
        [_hr_row(i) for i in range(1000, 2000)],
        [_hr_row(i) for i in range(2000, 2500)],
    ]
    _patch_client(monkeypatch, table)
    samples = data.read_hr_samples("sid")
    assert samples.rr_ms.size == 2500
    assert len(table.range_calls) == 3


def test_write_session_metrics_uses_strict_insert(monkeypatch: pytest.MonkeyPatch) -> None:
    table = _MockTable()
    _patch_client(monkeypatch, table)
    row = SessionMetricsRow(
        session_id="sid",
        duration_s=300,
        hr_avg=35.0,
        hr_peak=42,
        hr_min=30,
        hr_sd=2.5,
        rmssd_ms=33.0,
        sdnn_ms=41.0,
        pnn50_pct=12.0,
        pnn20_pct=24.0,
        rr_cleaning_quality=1.0,
        hrv_completeness_quality=1.0,
        algo_version="0.3.1",
    )
    data.write_session_metrics(row)
    assert len(table.insert_calls) == 1
    assert table.insert_calls[0]["session_id"] == "sid"


def test_write_session_metrics_translates_pk_violation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    table = _MockTable()
    table._insert_raises = Exception("duplicate key value violates unique constraint (23505)")
    _patch_client(monkeypatch, table)
    row = SessionMetricsRow(
        session_id="sid",
        duration_s=0,
        hr_avg=0.0,
        hr_peak=0,
        hr_min=0,
        hr_sd=0.0,
        rmssd_ms=0.0,
        sdnn_ms=0.0,
        pnn50_pct=0.0,
        pnn20_pct=0.0,
        rr_cleaning_quality=0.0,
        hrv_completeness_quality=0.0,
        algo_version="0.3.1",
    )
    with pytest.raises(ValueError, match="metrics_already_exist"):
        data.write_session_metrics(row)


def test_set_metrics_status_issues_update(monkeypatch: pytest.MonkeyPatch) -> None:
    table = _MockTable()
    _patch_client(monkeypatch, table)
    data.set_metrics_status("sid", "complete")
    assert table.update_calls == [{"metrics_status": "complete"}]


def test_delete_session_metrics_issues_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    table = _MockTable()
    _patch_client(monkeypatch, table)
    data.delete_session_metrics("sid")
    assert table.delete_called is True


def test_filter_hr_for_stats() -> None:
    # Bounds are [20, 240] - equine resting HR can sit at 25-35 BPM and
    # XC peaks can hit 235 BPM; both must survive the filter.
    arr = np.array([0.0, 15.0, 20.0, 28.0, 80.0, 235.0, 240.0, 250.0, np.nan])
    kept, n_dropped = data.filter_hr_for_stats(arr)
    assert list(kept) == [20.0, 28.0, 80.0, 235.0, 240.0]
    assert n_dropped == 4


def _row(**overrides: object) -> SessionMetricsRow:
    base: dict[str, object] = {
        "session_id": "sid",
        "duration_s": 300,
        "hr_avg": 35.0,
        "hr_peak": 42,
        "hr_min": 30,
        "hr_sd": 2.5,
        "rmssd_ms": 33.0,
        "sdnn_ms": 41.0,
        "pnn50_pct": 12.0,
        "pnn20_pct": 24.0,
        "rr_cleaning_quality": 1.0,
        "hrv_completeness_quality": 1.0,
        "algo_version": "0.5.1",
    }
    base.update(overrides)
    return SessionMetricsRow(**base)  # type: ignore[arg-type]


def test_write_recovery_three_state_none_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    """Rest session: tau_s=None, fit_quality=None — both serialize as NULL distinctly from 0.0."""
    table = _MockTable()
    _patch_client(monkeypatch, table)
    data.write_session_metrics(_row(recovery_tau_s=None, recovery_fit_quality=None))
    payload = table.insert_calls[0]
    assert payload["recovery_tau_s"] is None
    assert payload["recovery_fit_quality"] is None


def test_write_recovery_three_state_failed_serializes_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    """Attempted-but-failed: tau_s=None, fit_quality=0.0 — must NOT collapse to NULL."""
    table = _MockTable()
    _patch_client(monkeypatch, table)
    data.write_session_metrics(_row(recovery_tau_s=None, recovery_fit_quality=0.0))
    payload = table.insert_calls[0]
    assert payload["recovery_tau_s"] is None
    assert payload["recovery_fit_quality"] == 0.0  # critical: NOT None
    assert payload["recovery_fit_quality"] is not None


def test_write_recovery_three_state_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """Successful fit: both columns populated."""
    table = _MockTable()
    _patch_client(monkeypatch, table)
    data.write_session_metrics(_row(recovery_tau_s=82.5, recovery_fit_quality=0.93))
    payload = table.insert_calls[0]
    assert payload["recovery_tau_s"] == 82.5
    assert payload["recovery_fit_quality"] == 0.93

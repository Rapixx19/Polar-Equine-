"""POST /compute integration tests with mocked Supabase data layer."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import numpy as np
import pytest
from fastapi.testclient import TestClient

from algorithms.version import algo_version
from service.data_types import SamplesHR, SessionRow
from tests.conftest import TEST_TOKEN


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def _session(
    metrics_status: str = "pending", *, sid: str | None = None, dur_s: int = 300
) -> SessionRow:
    sid = sid or str(uuid4())
    start = datetime.now(UTC) - timedelta(seconds=dur_s)
    return SessionRow(
        id=sid,
        activity_type="riding",
        start_time=start,
        end_time=start + timedelta(seconds=dur_s),
        metrics_status=metrics_status,  # type: ignore[arg-type]
    )


def _samples(n: int = 60, *, with_dropouts: int = 0) -> SamplesHR:
    rng = np.random.default_rng(0)
    rr = (1900 + rng.normal(0.0, 30.0, size=n)).astype(float)
    hr = np.full(n, 32.0)  # ~32 bpm at rest, in physiological bounds
    for i in range(with_dropouts):
        hr[i] = 0.0  # airborne dropout
    ts = (np.arange(n) * 1900).astype(np.int64)
    return SamplesHR(rr_ms=rr, hr_bpm=hr, timestamp_ms=ts)


@pytest.fixture
def patched(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Patch the data layer with in-memory spies."""
    state: dict[str, Any] = {
        "session": None,
        "samples": _samples(),
        "status_calls": [],
        "writes": [],
        "deletes": [],
        "write_raises": None,
    }

    def _read_session(_sid: str) -> SessionRow:
        if state["session"] is None:
            raise ValueError("session_not_found")
        return cast("SessionRow", state["session"])

    def _read_hr_samples(_sid: str) -> SamplesHR:
        return cast("SamplesHR", state["samples"])

    def _set_metrics_status(sid: str, status: str) -> None:
        state["status_calls"].append((sid, status))

    def _write_session_metrics(row: Any) -> None:
        if state["write_raises"] is not None:
            raise state["write_raises"]
        state["writes"].append(row)

    def _delete_session_metrics(sid: str) -> None:
        state["deletes"].append(sid)

    modules = (
        "service.routes._pipeline",
        "service.routes.compute",
        "service.routes.recompute",
    )
    for module in modules:
        monkeypatch.setattr(f"{module}.read_session", _read_session, raising=False)
        monkeypatch.setattr(f"{module}.read_hr_samples", _read_hr_samples, raising=False)
        monkeypatch.setattr(f"{module}.set_metrics_status", _set_metrics_status, raising=False)
        monkeypatch.setattr(
            f"{module}.write_session_metrics", _write_session_metrics, raising=False
        )
        monkeypatch.setattr(
            f"{module}.delete_session_metrics", _delete_session_metrics, raising=False
        )
    return state


def test_compute_401_without_bearer(client: TestClient) -> None:
    res = client.post("/compute", json={"session_id": str(uuid4())})
    assert res.status_code == 401


def test_compute_404_session_not_found(client: TestClient, patched: dict[str, Any]) -> None:
    patched["session"] = None
    res = client.post("/compute", json={"session_id": str(uuid4())}, headers=_auth())
    assert res.status_code == 404


def test_compute_409_already_complete(client: TestClient, patched: dict[str, Any]) -> None:
    patched["session"] = _session(metrics_status="complete")
    res = client.post(
        "/compute", json={"session_id": patched["session"].id}, headers=_auth()
    )
    assert res.status_code == 409
    assert patched["status_calls"] == []


def test_compute_409_already_computing(client: TestClient, patched: dict[str, Any]) -> None:
    patched["session"] = _session(metrics_status="computing")
    res = client.post(
        "/compute", json={"session_id": patched["session"].id}, headers=_auth()
    )
    assert res.status_code == 409
    assert patched["status_calls"] == []


def test_compute_422_insufficient_samples(client: TestClient, patched: dict[str, Any]) -> None:
    patched["session"] = _session()
    patched["samples"] = _samples(n=5)
    res = client.post(
        "/compute", json={"session_id": patched["session"].id}, headers=_auth()
    )
    assert res.status_code == 422
    assert ("computing" in [s for _, s in patched["status_calls"]])
    assert ("failed" in [s for _, s in patched["status_calls"]])


def test_compute_happy_path(client: TestClient, patched: dict[str, Any]) -> None:
    sess = _session(dur_s=300)
    patched["session"] = sess
    res = client.post("/compute", json={"session_id": sess.id}, headers=_auth())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "complete"
    assert body["metrics_id"] == sess.id
    assert body["label_count"] == 0
    assert body["algo_version"] == algo_version
    assert len(patched["writes"]) == 1
    written = patched["writes"][0]
    assert written.session_id == sess.id
    assert written.duration_s == 300
    assert written.algo_version == algo_version
    assert 0.0 <= written.rr_cleaning_quality <= 1.0
    assert 0.0 <= written.hrv_completeness_quality <= 1.0
    assert 0 < written.pnn50_pct <= 100
    statuses = [s for _, s in patched["status_calls"]]
    assert statuses[0] == "computing"
    assert statuses[-1] == "complete"


def test_compute_filters_dropouts_for_hr_stats(
    client: TestClient, patched: dict[str, Any]
) -> None:
    sess = _session()
    patched["session"] = sess
    patched["samples"] = _samples(n=60, with_dropouts=5)
    res = client.post("/compute", json={"session_id": sess.id}, headers=_auth())
    assert res.status_code == 200, res.text
    written = patched["writes"][0]
    # hr_min should reflect the 32 bpm baseline, not the 0 dropouts
    assert written.hr_min >= 30
    assert written.hr_avg > 30


def test_compute_500_on_existing_metrics_row(
    client: TestClient, patched: dict[str, Any]
) -> None:
    sess = _session()
    patched["session"] = sess
    patched["write_raises"] = ValueError("metrics_already_exist")
    res = client.post("/compute", json={"session_id": sess.id}, headers=_auth())
    assert res.status_code == 500
    statuses = [s for _, s in patched["status_calls"]]
    assert statuses[-1] == "failed"


def test_compute_rejects_extra_fields(client: TestClient, patched: dict[str, Any]) -> None:
    patched["session"] = _session()
    res = client.post(
        "/compute",
        json={"session_id": patched["session"].id, "evil": "extra"},
        headers=_auth(),
    )
    assert res.status_code == 422

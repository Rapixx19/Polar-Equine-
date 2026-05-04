"""POST /recompute integration tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import numpy as np
import pytest
from fastapi.testclient import TestClient

from service.data_types import SamplesHR, SessionRow
from tests.conftest import TEST_TOKEN


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def _session(metrics_status: str = "complete") -> SessionRow:
    sid = str(uuid4())
    start = datetime.now(UTC) - timedelta(seconds=300)
    return SessionRow(
        id=sid,
        activity_type="riding",
        start_time=start,
        end_time=start + timedelta(seconds=300),
        metrics_status=metrics_status,  # type: ignore[arg-type]
    )


def _samples(n: int = 60) -> SamplesHR:
    rng = np.random.default_rng(2)
    rr = (1900 + rng.normal(0.0, 30.0, size=n)).astype(float)
    hr = np.full(n, 32.0)
    ts = (np.arange(n) * 1900).astype(np.int64)
    return SamplesHR(rr_ms=rr, hr_bpm=hr, timestamp_ms=ts)


@pytest.fixture
def patched(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    state: dict[str, Any] = {
        "session": None,
        "samples": _samples(),
        "deletes": [],
        "status_calls": [],
        "writes": [],
    }

    def _read_session(_sid: str) -> SessionRow:
        if state["session"] is None:
            raise ValueError("session_not_found")
        return cast("SessionRow", state["session"])

    def _read_hr_samples(_sid: str) -> SamplesHR:
        return cast("SamplesHR", state["samples"])

    def _delete_session_metrics(sid: str) -> None:
        state["deletes"].append(sid)

    def _set_metrics_status(sid: str, status: str) -> None:
        state["status_calls"].append((sid, status))

    def _write_session_metrics(row: Any) -> None:
        state["writes"].append(row)

    for module in ("service.routes._pipeline", "service.routes.recompute"):
        monkeypatch.setattr(f"{module}.read_session", _read_session, raising=False)
        monkeypatch.setattr(f"{module}.read_hr_samples", _read_hr_samples, raising=False)
        monkeypatch.setattr(
            f"{module}.delete_session_metrics", _delete_session_metrics, raising=False
        )
        monkeypatch.setattr(f"{module}.set_metrics_status", _set_metrics_status, raising=False)
        monkeypatch.setattr(
            f"{module}.write_session_metrics", _write_session_metrics, raising=False
        )
    return state


def test_recompute_401_without_bearer(client: TestClient) -> None:
    res = client.post("/recompute", json={"session_id": str(uuid4())})
    assert res.status_code == 401


def test_recompute_404_session_not_found(client: TestClient, patched: dict[str, Any]) -> None:
    patched["session"] = None
    res = client.post("/recompute", json={"session_id": str(uuid4())}, headers=_auth())
    assert res.status_code == 404


def test_recompute_skips_409_and_deletes_first(
    client: TestClient, patched: dict[str, Any]
) -> None:
    sess = _session(metrics_status="complete")
    patched["session"] = sess
    res = client.post("/recompute", json={"session_id": sess.id}, headers=_auth())
    assert res.status_code == 200, res.text
    assert patched["deletes"] == [sess.id]
    statuses = [s for _, s in patched["status_calls"]]
    # /recompute resets to 'pending' before flipping to 'computing' (audit trail)
    assert "pending" in statuses
    assert statuses[-1] == "complete"
    assert len(patched["writes"]) == 1


def test_recompute_happy_path_pending_session(
    client: TestClient, patched: dict[str, Any]
) -> None:
    sess = _session(metrics_status="pending")
    patched["session"] = sess
    res = client.post("/recompute", json={"session_id": sess.id}, headers=_auth())
    assert res.status_code == 200
    assert patched["deletes"] == [sess.id]

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
    # Slice 11 — workload columns must be populated (not NULL).
    assert written.trimp_banister is not None
    assert written.trimp_banister >= 0.0
    assert written.workload_quality is not None
    assert 0.0 <= written.workload_quality <= 1.0
    assert written.avg_hr_pct is not None
    assert written.avg_hr_pct >= 0.0
    for z in (
        written.time_z1_s,
        written.time_z2_s,
        written.time_z3_s,
        written.time_z4_s,
        written.time_z5_s,
    ):
        assert z is not None and z >= 0
    # Slice 11.5 — non-rest activity attempts recovery; flat synthetic HR has no
    # real peak/decay, so this is the attempted-and-failed three-state branch:
    # tau_s=None but fit_quality=0.0 (NOT None).
    assert written.recovery_tau_s is None
    assert written.recovery_fit_quality == 0.0
    statuses = [s for _, s in patched["status_calls"]]
    assert statuses[0] == "computing"
    assert statuses[-1] == "complete"


@pytest.mark.parametrize("rest_activity", ["stall", "grass_field", "transport", "vet"])
def test_compute_rest_activities_write_null_recovery(
    client: TestClient, patched: dict[str, Any], rest_activity: str
) -> None:
    """Each REST_ACTIVITIES value skips recovery → both columns NULL (not 0.0)."""
    sess = _session(dur_s=300)
    rest_sess = SessionRow(
        id=sess.id,
        activity_type=rest_activity,
        start_time=sess.start_time,
        end_time=sess.end_time,
        metrics_status=sess.metrics_status,
    )
    patched["session"] = rest_sess
    res = client.post("/compute", json={"session_id": rest_sess.id}, headers=_auth())
    assert res.status_code == 200, res.text
    written = patched["writes"][0]
    assert written.recovery_tau_s is None
    assert written.recovery_fit_quality is None


@pytest.mark.parametrize("non_rest_activity", ["walker", "other"])
def test_compute_walker_and_other_attempt_recovery(
    client: TestClient, patched: dict[str, Any], non_rest_activity: str
) -> None:
    """Borderline activity_types (walker, other) attempt recovery → fit_quality=0.0
    on the synthetic flat HR (no_decay), NOT NULL. Preserves three-state distinction."""
    sess = _session(dur_s=300)
    non_rest = SessionRow(
        id=sess.id,
        activity_type=non_rest_activity,
        start_time=sess.start_time,
        end_time=sess.end_time,
        metrics_status=sess.metrics_status,
    )
    patched["session"] = non_rest
    res = client.post("/compute", json={"session_id": non_rest.id}, headers=_auth())
    assert res.status_code == 200, res.text
    written = patched["writes"][0]
    # "tried but no decay" — distinct from "didn't try."
    assert written.recovery_tau_s is None
    assert written.recovery_fit_quality == 0.0


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


def test_workload_config_helper_per_horse_calibration() -> None:
    """Migration 038: per-horse HR_max/HR_rest override the species defaults
    and a half-calibrated horse keeps the default for the unset field."""
    from algorithms.trimp_zones import WorkloadConfig
    from service.routes._pipeline import _workload_config

    base = _session()
    defaults = WorkloadConfig()

    uncalibrated = SessionRow(**{**base.__dict__})
    assert _workload_config(uncalibrated) is None

    full = SessionRow(**{**base.__dict__, "hr_max_bpm": 150, "hr_rest_bpm": 38})
    cfg_full = _workload_config(full)
    assert cfg_full is not None
    assert cfg_full.hr_max_bpm == 150.0
    assert cfg_full.hr_rest_bpm == 38.0

    half = SessionRow(**{**base.__dict__, "hr_max_bpm": 150})
    cfg_half = _workload_config(half)
    assert cfg_half is not None
    assert cfg_half.hr_max_bpm == 150.0
    assert cfg_half.hr_rest_bpm == defaults.hr_rest_bpm


def test_compute_calibrated_horse_lands_in_zones(
    client: TestClient, patched: dict[str, Any]
) -> None:
    """End-to-end: a horse with hr_max_bpm=150 working at HR=120 should put
    time into Z4 (80%+), where the species default (225) would keep every
    sample below the Z1 floor. Reproduces Emma's 2026-05-15 ride shape."""
    sess = _session(dur_s=300)
    calibrated = SessionRow(
        id=sess.id,
        activity_type=sess.activity_type,
        start_time=sess.start_time,
        end_time=sess.end_time,
        metrics_status=sess.metrics_status,
        hr_max_bpm=150,
        hr_rest_bpm=38,
    )
    patched["session"] = calibrated
    rng = np.random.default_rng(0)
    n = 60
    rr = (1900 + rng.normal(0.0, 30.0, size=n)).astype(float)
    hr = np.full(n, 120.0)
    ts = (np.arange(n) * 1900).astype(np.int64)
    patched["samples"] = SamplesHR(rr_ms=rr, hr_bpm=hr, timestamp_ms=ts)

    res = client.post("/compute", json={"session_id": calibrated.id}, headers=_auth())
    assert res.status_code == 200, res.text
    written = patched["writes"][0]
    total_zone_s = sum(
        z
        for z in (
            written.time_z1_s,
            written.time_z2_s,
            written.time_z3_s,
            written.time_z4_s,
            written.time_z5_s,
        )
        if z is not None
    )
    assert total_zone_s > 0, "calibrated config must put work into some zone"


def test_compute_plausibility_gate_preserves_hrv_and_downgrades_status(
    client: TestClient,
    patched: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Plausibility gate downgrades status + sets quality_flags, but HRV
    values are persisted. Horse data is baseline-noisy; nulling every
    flagged ride hid usable signal. Reproduces Emma's 2026-05-15 RMSSD=747
    ride: row keeps the numbers, admin UI reads quality_flags for the badge."""
    from algorithms.hrv_metrics import HRVResult

    def _bad_hrv(rr_clean_ms: Any) -> HRVResult:
        return HRVResult(
            rmssd_ms=747.0,
            sdnn_ms=613.0,
            pnn50_pct=83.0,
            pnn20_pct=90.0,
            mean_rr_ms=1900.0,
            n_beats=60,
            quality=1.0,
        )

    monkeypatch.setattr("service.routes._pipeline.hrv_metrics.compute", _bad_hrv)

    sess = _session(dur_s=300)
    patched["session"] = sess
    res = client.post("/compute", json={"session_id": sess.id}, headers=_auth())
    assert res.status_code == 200, res.text

    written = patched["writes"][0]
    # HRV values are preserved — the badge is in quality_flags + status.
    assert written.rmssd_ms == 747.0
    assert written.sdnn_ms == 613.0
    assert written.pnn50_pct == 83.0
    assert written.pnn20_pct == 90.0
    assert written.hrv_completeness_quality == 1.0
    assert written.quality_flags.get("rmssd_implausible") is True
    assert written.quality_flags.get("sdnn_implausible") is True
    assert written.hr_avg > 0
    assert written.hr_peak > 0
    # Status still downgrades so admin renders the "noisy" badge.
    statuses = [s for _, s in patched["status_calls"]]
    assert statuses[0] == "computing"
    assert statuses[-1] == "complete_low_quality"

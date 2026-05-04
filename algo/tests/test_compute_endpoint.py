"""Tests for POST /compute."""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from algorithms.version import algo_version
from tests.conftest import TEST_TOKEN


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def _synthetic_horse_rr(seed: int = 0, n: int = 60) -> list[int]:
    rng = np.random.default_rng(seed)
    arr = (1900 + rng.normal(0.0, 30.0, size=n)).round().astype(int)
    return [int(v) for v in arr]


def test_compute_401_without_bearer(client: TestClient) -> None:
    res = client.post("/compute", json={"rr_ms": _synthetic_horse_rr()})
    assert res.status_code == 401


def test_compute_401_with_wrong_bearer(client: TestClient) -> None:
    res = client.post(
        "/compute",
        json={"rr_ms": _synthetic_horse_rr()},
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert res.status_code == 401


def test_compute_422_too_few_beats(client: TestClient) -> None:
    res = client.post("/compute", json={"rr_ms": [1000] * 20}, headers=_auth())
    assert res.status_code == 422


def test_compute_422_rr_cleaning_zero_input(client: TestClient) -> None:
    # 30 entries all 100 ms — every beat fails the bounds check (rr_min=800).
    # Expected mapping: ValueError("no_valid_beats") → 422.
    res = client.post("/compute", json={"rr_ms": [100] * 30}, headers=_auth())
    assert res.status_code == 422


def test_compute_happy_path_synthetic(client: TestClient) -> None:
    rr = _synthetic_horse_rr(seed=1, n=60)
    res = client.post("/compute", json={"rr_ms": rr}, headers=_auth())
    assert res.status_code == 200
    body = res.json()
    assert body["algo_version"] == "0.2.0"
    assert body["algo_version"] == algo_version  # double-belt sanity check
    assert body["n_beats"] == 60
    assert body["hrv_completeness_quality"] == 1.0
    assert 0.0 <= body["rr_cleaning_quality"] <= 1.0
    assert body["rmssd_ms"] > 0.0
    assert body["sdnn_ms"] > 0.0
    assert "mean_rr_ms" in body
    assert "pnn50_pct" in body
    assert "pnn20_pct" in body


def test_compute_rejects_extra_fields(client: TestClient) -> None:
    res = client.post(
        "/compute",
        json={"rr_ms": _synthetic_horse_rr(), "evil": "extra"},
        headers=_auth(),
    )
    assert res.status_code == 422



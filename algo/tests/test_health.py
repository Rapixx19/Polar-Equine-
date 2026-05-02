from fastapi.testclient import TestClient

from tests.conftest import TEST_TOKEN


def test_health_with_valid_bearer_returns_ok(client: TestClient) -> None:
    response = client.get(
        "/health",
        headers={"Authorization": f"Bearer {TEST_TOKEN}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["algo_version"] == "0.1.0"


def test_health_without_bearer_returns_401(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 401


def test_health_with_wrong_bearer_returns_401(client: TestClient) -> None:
    response = client.get(
        "/health",
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401

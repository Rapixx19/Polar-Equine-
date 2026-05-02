import os

TEST_TOKEN = "test-bearer-token-not-secret"
os.environ.setdefault("ALGO_BEARER_TOKEN", TEST_TOKEN)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    from service.main import app

    return TestClient(app)

# algorithms/09 · Testing Strategy

## Test pyramid for the algo repo

```
         Integration tests (FastAPI TestClient + real DB)   ← 4–6 tests
         ─────────────────────────────────────────────
         Property-based tests (hypothesis)                  ← per algorithm
         ─────────────────────────────────────────────
         Unit tests (pytest)                                ← per public function
```

## Tooling

- **pytest** — base runner
- **pytest-asyncio** — for async FastAPI handlers
- **hypothesis** — property-based testing for math-heavy functions
- **httpx** + **TestClient** — integration tests against FastAPI
- **respx** — mock outbound HTTP (Supabase)
- **pyarrow** — load Parquet fixtures

## Directory layout

```
tests/
├── conftest.py                       ← shared fixtures
├── unit/
│   ├── test_rr_cleaning.py
│   ├── test_hrv_metrics.py
│   ├── test_recovery_tau.py
│   ├── test_trimp_zones.py
│   ├── test_gait_detection.py
│   ├── test_session_metrics.py
│   └── test_anomaly_rest.py
├── integration/
│   ├── test_compute_endpoint.py
│   └── test_full_session.py
└── fixtures/
    ├── healthy_session_50min.parquet     ← real-ish recording
    ├── synthetic_gallop.parquet          ← hand-crafted
    ├── horse_with_av_block.parquet       ← physiological 2°-AV at rest
    ├── short_session_5min.parquet        ← edge-case duration
    └── corrupted_session.parquet         ← BLE-glitched data
```

## Coverage targets

- **Unit:** 90% lines on each algorithm module
- **Integration:** every public API endpoint has at least one test
- **Property-based:** invariants documented and checked for HRV, TRIMP, gait

## Property-based examples

```python
# tests/unit/test_hrv_metrics.py

from hypothesis import given, strategies as st
import numpy as np
from algorithms.hrv_metrics import compute

@given(st.lists(
    st.floats(min_value=800, max_value=3000),
    min_size=30, max_size=2000,
))
def test_hrv_metrics_always_non_negative(rr_list):
    """HRV metrics must always be non-negative for valid input."""
    rr = np.array(rr_list)
    result = compute(rr)
    assert result.rmssd_ms >= 0
    assert result.sdnn_ms >= 0
    assert 0 <= result.pnn50_pct <= 100

@given(st.lists(
    st.floats(min_value=900, max_value=2500),
    min_size=30, max_size=500,
))
def test_constant_rr_yields_zero_variability(rr_value):
    """A constant RR series has zero variability."""
    rr = np.full(100, rr_value[0] if rr_value else 1500.0)
    result = compute(rr)
    assert result.rmssd_ms == 0
    assert result.sdnn_ms == 0
    assert result.pnn50_pct == 0
```

## Integration test pattern

```python
# tests/integration/test_compute_endpoint.py

import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_compute_full_pipeline_with_real_db(test_supabase, test_session):
    """Full flow: real Supabase, real samples, real algorithms."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/compute",
            json={"session_id": test_session.id},
            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete"
    
    # Verify DB state
    metrics = await test_supabase.fetch_metrics(test_session.id)
    assert metrics.hr_avg > 0
    assert metrics.algo_version is not None
```

## Test fixtures

```python
# tests/conftest.py

import pytest
import pyarrow.parquet as pq
import pandas as pd
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"

@pytest.fixture
def healthy_session():
    return pq.read_table(FIXTURES / "healthy_session_50min.parquet").to_pandas()

@pytest.fixture
def synthetic_gallop():
    return pq.read_table(FIXTURES / "synthetic_gallop.parquet").to_pandas()

@pytest.fixture
def av_block_session():
    return pq.read_table(FIXTURES / "horse_with_av_block.parquet").to_pandas()

@pytest.fixture
async def test_session(test_supabase):
    """Seed a real session row + samples for integration tests."""
    horse = await test_supabase.create_test_horse()
    rider = await test_supabase.create_test_rider()
    session = await test_supabase.create_test_session(horse.id, rider.id)
    
    samples = healthy_session()  # imported as fixture
    await test_supabase.insert_samples(session.id, samples)
    
    yield session
    
    await test_supabase.cleanup_session(session.id)
```

## Generating realistic fixtures

`tests/fixtures/_generate.py` (run once, output committed):

```python
import numpy as np
import pandas as pd

def generate_healthy_session_50min():
    """A typical 50-minute schooling session."""
    fs_hr = 1.0      # Hz
    fs_acc = 52.0    # Hz
    duration_s = 3000  # 50 min
    
    # HR trace: warm-up rising 50→90, work 90-150, cool-down 150→60
    t_hr = np.arange(0, duration_s, 1 / fs_hr)
    hr = np.piecewise(t_hr, [
        t_hr < 600,
        (t_hr >= 600) & (t_hr < 2400),
        t_hr >= 2400
    ], [
        lambda t: 50 + (t / 600) * 40,
        lambda t: 90 + 30 * np.sin(2 * np.pi * t / 240) + np.random.normal(0, 5, len(t)),
        lambda t: 150 - ((t - 2400) / 600) * 90,
    ])
    
    # ACC: alternating walk/trot/canter pattern
    t_acc = np.arange(0, duration_s, 1 / fs_acc)
    # ... complex generation
    
    return pd.DataFrame({...})

if __name__ == "__main__":
    df = generate_healthy_session_50min()
    df.to_parquet("healthy_session_50min.parquet")
```

## Continuous integration

`.github/workflows/test.yml` for `lafattoria-algo`:
- Triggered on push and PR
- Sets up Python 3.11
- Installs Poetry deps
- Runs `pytest --cov` (unit + integration)
- Posts coverage to PR
- Runs `mypy --strict` to catch type errors

## Running locally

```bash
poetry install
poetry run pytest                   # all
poetry run pytest tests/unit        # unit only
poetry run pytest -k "test_hrv"     # filter by name
poetry run pytest --cov             # with coverage
poetry run mypy app algorithms      # type check
```

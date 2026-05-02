# algorithms/01 · Service API

## Feature scope

The FastAPI HTTP layer that web calls into. Three endpoints.

## Public interface

### `POST /compute`

Run the full algorithm pipeline on a session.

**Auth:** `Authorization: Bearer ${ALGO_BEARER_TOKEN}`
**Body:** `{ "session_id": "uuid" }`
**Response:** `{ "status": "complete", "metrics_id": "uuid", "label_count": 12 }`

**Errors:**
- `401` Unauthorized
- `404` Session not found
- `409` Session already computed (idempotency check)
- `422` Insufficient data
- `500` Algorithm error (logged; sessions.metrics_status='failed')

### `POST /recompute`

Same as `/compute` but forces re-run even if already computed. Used by admin "Re-run algorithms" button.

### `GET /health`

Liveness probe for Railway. Returns `{ "status": "ok", "version": "0.1.0" }`.

## Files

```
app/main.py                 ← FastAPI app, mounts routes (≤ 100 lines)
app/routes/compute.py       ← POST /compute (≤ 130 lines)
app/routes/recompute.py     ← POST /recompute (≤ 100 lines)
app/routes/health.py        ← GET /health (≤ 30 lines)
app/auth.py                 ← bearer token check (≤ 50 lines)
app/config.py               ← env config (≤ 80 lines)
tests/integration/test_compute_endpoint.py
```

## Implementation sketch

```python
# app/main.py

from fastapi import FastAPI
from app.routes import compute, recompute, health

app = FastAPI(title="La Fattoria Algorithms", version="0.1.0")

app.include_router(health.router, prefix="")
app.include_router(compute.router, prefix="")
app.include_router(recompute.router, prefix="")

@app.exception_handler(AlgoError)
async def algo_error_handler(request, exc):
    return JSONResponse(status_code=exc.status_code,
                        content={"error": exc.code, "message": str(exc)})
```

```python
# app/routes/compute.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import verify_bearer
from data.readers import read_session, read_acc_samples, read_hr_samples
from data.writers import write_session_metrics, write_labels, set_metrics_status
from algorithms import (
    rr_cleaning, hrv_metrics, recovery_tau, trimp_zones,
    gait_detection, session_metrics
)

router = APIRouter()

class ComputeRequest(BaseModel):
    session_id: str

@router.post("/compute", dependencies=[Depends(verify_bearer)])
async def compute(req: ComputeRequest):
    """
    Run the full algorithm pipeline on a session.
    """
    session = await read_session(req.session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.metrics_status == "complete":
        raise HTTPException(409, "Already computed (use /recompute to force)")
    
    await set_metrics_status(req.session_id, "computing")
    
    try:
        # Layer 1 — signal processing
        hr_samples = await read_hr_samples(req.session_id)
        rr_clean = rr_cleaning.clean(hr_samples.rr_ms.values)
        
        hrv = hrv_metrics.compute(rr_clean)
        zones = trimp_zones.compute(hr_samples)
        recovery = recovery_tau.fit(hr_samples)
        
        # Layer 2 — gait detection (only for riding sessions)
        labels = []
        if session.activity_type == "riding":
            acc_samples = await read_acc_samples(req.session_id)
            labels = gait_detection.detect_gaits(acc_samples)
        
        # Layer 3 — compose
        metrics = session_metrics.compose(session, hrv, zones, recovery, labels)
        
        # Persist
        await write_labels(req.session_id, labels, source="auto")
        metrics_id = await write_session_metrics(req.session_id, metrics)
        await set_metrics_status(req.session_id, "complete")
        
        return {
            "status": "complete",
            "metrics_id": metrics_id,
            "label_count": len(labels),
        }
    except Exception as e:
        await set_metrics_status(req.session_id, "failed")
        raise
```

## Auth

```python
# app/auth.py

from fastapi import Header, HTTPException
from app.config import settings

async def verify_bearer(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer")
    token = authorization.replace("Bearer ", "")
    if token != settings.ALGO_BEARER_TOKEN:
        raise HTTPException(401, "Invalid bearer")
```

## Idempotency

Calling `/compute` on the same session_id twice returns 409 the second time. Use `/recompute` to force.

`/recompute` deletes existing labels (where source='auto') and metrics row, then runs `/compute` logic.

## Performance

Target: < 8 seconds for a 50-min session.

Bottleneck is usually Supabase reads — ~75K ACC rows, ~390K ECG rows. Optimizations:
- Read in parallel (`asyncio.gather`)
- Use pandas to vectorize, not Python loops
- Process ECG only if specifically needed (V.0 stores, doesn't analyze)

## Integration test

```python
# tests/integration/test_compute_endpoint.py

@pytest.mark.asyncio
async def test_compute_returns_metrics_for_real_session(test_session_id):
    response = await client.post("/compute", 
        headers={"Authorization": f"Bearer {TEST_TOKEN}"},
        json={"session_id": test_session_id})
    
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete"
    assert body["label_count"] > 0

@pytest.mark.asyncio
async def test_compute_rejects_invalid_token():
    response = await client.post("/compute",
        headers={"Authorization": "Bearer wrong"},
        json={"session_id": "any"})
    assert response.status_code == 401
```

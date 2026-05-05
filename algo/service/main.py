from fastapi import Depends, FastAPI, HTTPException

from algorithms import hrv_metrics, rr_cleaning
from algorithms.version import algo_version
from service.auth import require_bearer
from service.models import ComputeRequest, ComputeResponse

app = FastAPI(title="La Fattoria algo", version=algo_version)


@app.get("/health", dependencies=[Depends(require_bearer)])
def health() -> dict[str, str]:
    return {"status": "ok", "algo_version": algo_version}


@app.post("/compute", dependencies=[Depends(require_bearer)])
def compute(body: ComputeRequest) -> ComputeResponse:
    try:
        cleaned = rr_cleaning.clean(body.rr_ms)
        metrics = hrv_metrics.compute(cleaned.rr_clean_ms)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    return ComputeResponse(
        rmssd_ms=metrics.rmssd_ms,
        sdnn_ms=metrics.sdnn_ms,
        pnn50_pct=metrics.pnn50_pct,
        pnn20_pct=metrics.pnn20_pct,
        mean_rr_ms=metrics.mean_rr_ms,
        n_beats=metrics.n_beats,
        rr_cleaning_quality=cleaned.quality,
        hrv_completeness_quality=metrics.quality,
        algo_version=algo_version,
    )

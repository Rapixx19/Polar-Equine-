"""POST /recompute — admin escape hatch. Skips 409, deletes existing row first."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from service.auth import require_bearer
from service.data import delete_session_metrics, read_session, set_metrics_status
from service.models import ComputeResponse, RecomputeRequest
from service.routes._pipeline import run_compute_pipeline

router = APIRouter()


@router.post("/recompute", dependencies=[Depends(require_bearer)])
def recompute(body: RecomputeRequest) -> ComputeResponse:
    session_id = str(body.session_id)
    try:
        read_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    delete_session_metrics(session_id)
    set_metrics_status(session_id, "pending")

    refreshed = read_session(session_id)
    return run_compute_pipeline(refreshed)

"""POST /compute — main compute entry. 409 on already-computed-or-in-progress."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from service.auth import require_bearer
from service.data import read_session
from service.models import ComputeRequest, ComputeResponse
from service.routes._pipeline import run_compute_pipeline

router = APIRouter()


@router.post("/compute", dependencies=[Depends(require_bearer)])
def compute(body: ComputeRequest) -> ComputeResponse:
    session_id = str(body.session_id)
    try:
        session = read_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if session.metrics_status in ("complete", "computing"):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "already_computed_or_in_progress",
                "metrics_status": session.metrics_status,
            },
        )

    return run_compute_pipeline(session)

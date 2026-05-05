"""Shared /compute + /recompute pipeline. Rule 1 ≤150 lines.

Both routes do the same work after the 409/delete branch, so the inner
"clean → HRV → workload → write → mark complete" sequence lives here. Any
unhandled exception flips ``metrics_status='failed'`` before re-raising — Rule 9.
"""

from __future__ import annotations

import numpy as np
import structlog
from fastapi import HTTPException
from numpy.typing import NDArray

from algorithms import hrv_metrics, rr_cleaning, trimp_zones
from algorithms.version import algo_version
from service.data import (
    filter_hr_for_stats,
    read_hr_samples,
    set_metrics_status,
    write_session_metrics,
)
from service.data_types import SessionMetricsRow, SessionRow
from service.models import ComputeResponse

log = structlog.get_logger()


def run_compute_pipeline(session: SessionRow) -> ComputeResponse:
    set_metrics_status(session.id, "computing")
    try:
        samples = read_hr_samples(session.id)
        if samples.rr_ms.size < 30:
            set_metrics_status(session.id, "failed")
            raise HTTPException(status_code=422, detail="insufficient_samples")

        try:
            cleaned = rr_cleaning.clean(samples.rr_ms)
            metrics = hrv_metrics.compute(cleaned.rr_clean_ms)
        except ValueError as exc:
            set_metrics_status(session.id, "failed")
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        hr_kept, _n_dropped = filter_hr_for_stats(samples.hr_bpm)
        if hr_kept.size == 0:
            set_metrics_status(session.id, "failed")
            raise HTTPException(status_code=422, detail="no_valid_hr_samples")

        workload = trimp_zones.compute(samples.hr_bpm, samples.timestamp_ms)
        if workload.n_dropped > 0:
            log.warning(
                "trimp.hr_dropped",
                session_id=session.id,
                n_dropped=workload.n_dropped,
                quality=workload.quality,
            )

        row = _compose_metrics_row(
            session=session,
            cleaned=cleaned,
            metrics=metrics,
            hr_kept=hr_kept,
            workload=workload,
            duration_s=_duration_s(session),
        )
        try:
            write_session_metrics(row)
        except ValueError as exc:
            set_metrics_status(session.id, "failed")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        set_metrics_status(session.id, "complete")
    except HTTPException:
        raise
    except Exception:
        set_metrics_status(session.id, "failed")
        raise

    return ComputeResponse(
        status="complete",
        metrics_id=session.id,
        label_count=0,
        algo_version=algo_version,
    )


def _compose_metrics_row(
    session: SessionRow,
    cleaned: rr_cleaning.CleaningResult,
    metrics: hrv_metrics.HRVResult,
    hr_kept: NDArray[np.float64],
    workload: trimp_zones.WorkloadResult,
    duration_s: int,
) -> SessionMetricsRow:
    return SessionMetricsRow(
        session_id=session.id,
        duration_s=duration_s,
        hr_avg=float(np.mean(hr_kept)),
        hr_peak=int(np.max(hr_kept)),
        hr_min=int(np.min(hr_kept)),
        hr_sd=float(np.std(hr_kept, ddof=1)) if hr_kept.size > 1 else 0.0,
        rmssd_ms=metrics.rmssd_ms,
        sdnn_ms=metrics.sdnn_ms,
        pnn50_pct=metrics.pnn50_pct,
        pnn20_pct=metrics.pnn20_pct,
        rr_cleaning_quality=cleaned.quality,
        hrv_completeness_quality=metrics.quality,
        algo_version=algo_version,
        trimp_banister=workload.trimp_banister,
        time_z1_s=workload.time_z1_s,
        time_z2_s=workload.time_z2_s,
        time_z3_s=workload.time_z3_s,
        time_z4_s=workload.time_z4_s,
        time_z5_s=workload.time_z5_s,
        avg_hr_pct=workload.avg_hr_pct,
        workload_quality=workload.quality,
    )


def _duration_s(session: SessionRow) -> int:
    if session.end_time is None:
        return 0
    return int((session.end_time - session.start_time).total_seconds())

"""Shared /compute + /recompute pipeline. Rule 1 ≤150 lines. Any unhandled
exception flips ``metrics_status='failed'`` before re-raising — Rule 9."""

from __future__ import annotations

import structlog
from fastapi import HTTPException

from algorithms import hrv_metrics, recovery_tau, rr_cleaning, trimp_zones
from algorithms.version import algo_version
from service.data import (
    filter_hr_for_stats,
    read_hr_samples,
    set_metrics_status,
    write_session_metrics,
)
from service.data_types import REST_ACTIVITIES, SamplesHR, SessionRow
from service.models import ComputeResponse
from service.routes._gait import label_session_from_acc
from service.routes._quality_gate import evaluate_hrv_quality
from service.routes._row_compose import compose_metrics_row

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

        recovery_tau_s, recovery_fit_quality = _compute_recovery(session, samples)

        verdict = evaluate_hrv_quality(
            rr_cleaning_quality=cleaned.quality,
            rmssd_ms=metrics.rmssd_ms,
            sdnn_ms=metrics.sdnn_ms,
        )
        if verdict.hrv_unreliable:
            log.warning(
                "hrv.plausibility_gate_tripped",
                session_id=session.id,
                flags=verdict.flags,
                rr_cleaning_quality=cleaned.quality,
                rmssd_ms=metrics.rmssd_ms,
                sdnn_ms=metrics.sdnn_ms,
            )

        row = compose_metrics_row(
            session=session,
            cleaned=cleaned,
            metrics=metrics,
            hr_kept=hr_kept,
            workload=workload,
            recovery_tau_s=recovery_tau_s,
            recovery_fit_quality=recovery_fit_quality,
            duration_s=_duration_s(session),
            quality_flags=verdict.flags,
            null_hrv=verdict.hrv_unreliable,
        )
        try:
            write_session_metrics(row)
        except ValueError as exc:
            set_metrics_status(session.id, "failed")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        label_count = _label_gait_safely(session.id)
        final_status = "complete_low_quality" if verdict.hrv_unreliable else "complete"
        set_metrics_status(session.id, final_status)
    except HTTPException:
        raise
    except Exception:
        set_metrics_status(session.id, "failed")
        raise

    return ComputeResponse(
        status="complete",
        metrics_id=session.id,
        label_count=label_count,
        algo_version=algo_version,
    )


def _label_gait_safely(session_id: str) -> int:
    # Auto-labels are nice-to-have; metrics are the contract. Failure here
    # must not flip metrics_status — log and keep going.
    try:
        return label_session_from_acc(session_id)
    except Exception as exc:
        log.warning("gait.labelling_failed", session_id=session_id, error=str(exc))
        return 0


def _compute_recovery(session: SessionRow, samples: SamplesHR) -> tuple[float | None, float | None]:
    # Three-state: rest → (None, None); else → fit() and surface tau_s + quality.
    if session.activity_type in REST_ACTIVITIES:
        log.info("recovery.skipped_rest", session_id=session.id, activity=session.activity_type)
        return None, None
    result = recovery_tau.fit(samples.hr_bpm, samples.timestamp_ms)
    if result.reason != "ok":
        log.warning("recovery.fit_failed", session_id=session.id, reason=result.reason)
    return result.tau_s, result.fit_quality


def _duration_s(session: SessionRow) -> int:
    if session.end_time is None:
        return 0
    return int((session.end_time - session.start_time).total_seconds())

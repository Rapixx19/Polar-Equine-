"""Supabase data layer for /compute + /recompute (sync API; Rule 1 ≤150 lines).

Strict-insert: ``write_session_metrics`` raises ``ValueError("metrics_already_exist")``
on PK collision. /compute relies on the 409 check guaranteeing no row exists;
/recompute deletes first. An existing-row insert is therefore a bug.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray
from supabase import Client, create_client

from service.data_types import MetricsStatus, SamplesHR, SessionMetricsRow, SessionRow
from service.settings import settings

_PAGE_SIZE = 1000
_HR_MIN_BPM = 30
_HR_MAX_BPM = 220


_client: Client | None = None


def get_supabase_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


def read_session(session_id: str) -> SessionRow:
    res = (
        get_supabase_client()
        .table("sessions")
        .select("id,activity_type,start_time,end_time,metrics_status")
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    raw_rows = res.data or []
    if not raw_rows:
        raise ValueError("session_not_found")
    row: dict[str, Any] = dict(cast("dict[str, Any]", raw_rows[0]))
    return SessionRow(
        id=str(row["id"]),
        activity_type=str(row["activity_type"]),
        start_time=_parse_ts(row["start_time"]),
        end_time=_parse_ts(row["end_time"]) if row["end_time"] else None,
        metrics_status=row["metrics_status"],
    )


def read_hr_samples(session_id: str) -> SamplesHR:
    rr: list[float] = []
    hr: list[float] = []
    ts: list[int] = []
    offset = 0
    while True:
        res = (
            get_supabase_client()
            .table("samples_hr")
            .select("timestamp_ms,hr_bpm,rr_ms")
            .eq("session_id", session_id)
            .not_.is_("rr_ms", "null")
            .order("timestamp_ms")
            .range(offset, offset + _PAGE_SIZE - 1)
            .execute()
        )
        raw_page = res.data or []
        page: list[dict[str, Any]] = [dict(cast("dict[str, Any]", r)) for r in raw_page]
        for row in page:
            rr.append(float(row["rr_ms"]))
            hr.append(float(row["hr_bpm"]) if row["hr_bpm"] is not None else float("nan"))
            ts.append(int(row["timestamp_ms"]))
        if len(page) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return SamplesHR(
        rr_ms=np.asarray(rr, dtype=float),
        hr_bpm=np.asarray(hr, dtype=float),
        timestamp_ms=np.asarray(ts, dtype=np.int64),
    )


def write_session_metrics(row: SessionMetricsRow) -> None:
    payload: dict[str, Any] = {
        "session_id": row.session_id,
        "duration_s": row.duration_s,
        "hr_avg": row.hr_avg,
        "hr_peak": row.hr_peak,
        "hr_min": row.hr_min,
        "hr_sd": row.hr_sd,
        "rmssd_ms": row.rmssd_ms,
        "sdnn_ms": row.sdnn_ms,
        "pnn50_pct": row.pnn50_pct,
        "pnn20_pct": row.pnn20_pct,
        "rr_cleaning_quality": row.rr_cleaning_quality,
        "hrv_completeness_quality": row.hrv_completeness_quality,
        "algo_version": row.algo_version,
        # Slice 11 — workload (TRIMP + zones). Present from algo_version 0.5.0.
        "trimp_banister": row.trimp_banister,
        "time_z1_s": row.time_z1_s,
        "time_z2_s": row.time_z2_s,
        "time_z3_s": row.time_z3_s,
        "time_z4_s": row.time_z4_s,
        "time_z5_s": row.time_z5_s,
        "avg_hr_pct": row.avg_hr_pct,
        "workload_quality": row.workload_quality,
    }
    try:
        get_supabase_client().table("session_metrics").insert(payload).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "23505" in msg or "duplicate key" in msg:
            raise ValueError("metrics_already_exist") from exc
        raise


def set_metrics_status(session_id: str, status: MetricsStatus) -> None:
    (
        get_supabase_client()
        .table("sessions")
        .update({"metrics_status": status})
        .eq("id", session_id)
        .execute()
    )


def delete_session_metrics(session_id: str) -> None:
    get_supabase_client().table("session_metrics").delete().eq("session_id", session_id).execute()


def filter_hr_for_stats(hr_bpm: NDArray[np.float64]) -> tuple[NDArray[np.float64], int]:
    """Drop NaN + values outside [30, 220] for stat computation. Returns (kept, n_dropped)."""
    finite = np.isfinite(hr_bpm)
    in_bounds = (hr_bpm >= _HR_MIN_BPM) & (hr_bpm <= _HR_MAX_BPM)
    keep = finite & in_bounds
    return hr_bpm[keep], int((~keep).sum())


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

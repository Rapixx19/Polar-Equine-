"""Build the ``SessionMetricsRow`` from the algorithm outputs.

Extracted from ``_pipeline.py`` to keep that module under Rule 1's 150-line
budget after the migration-036 plausibility gate landed. Pure data shaping —
no I/O, no logging, no policy. The plausibility gate now annotates suspect
HRV via ``quality_flags`` + status='complete_low_quality' (decided by the
caller) instead of nulling the numbers; horse data is baseline-noisy and
nulling every flagged row hides too much usable signal.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from algorithms import hrv_metrics, rr_cleaning, trimp_zones
from algorithms.version import algo_version
from service.data_types import SessionMetricsRow, SessionRow


def compose_metrics_row(
    *,
    session: SessionRow,
    cleaned: rr_cleaning.CleaningResult,
    metrics: hrv_metrics.HRVResult,
    hr_kept: NDArray[np.float64],
    workload: trimp_zones.WorkloadResult,
    recovery_tau_s: float | None,
    recovery_fit_quality: float | None,
    duration_s: int,
    quality_flags: dict[str, bool],
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
        quality_flags=quality_flags,
        algo_version=algo_version,
        trimp_banister=workload.trimp_banister,
        time_z1_s=workload.time_z1_s,
        time_z2_s=workload.time_z2_s,
        time_z3_s=workload.time_z3_s,
        time_z4_s=workload.time_z4_s,
        time_z5_s=workload.time_z5_s,
        avg_hr_pct=workload.avg_hr_pct,
        workload_quality=workload.quality,
        recovery_tau_s=recovery_tau_s,
        recovery_fit_quality=recovery_fit_quality,
    )

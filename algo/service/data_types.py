"""Plain dataclasses shared between the data layer and the routes.

Kept separate from ``data.py`` to honour Rule 1 (≤150 lines per file).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import numpy as np
from numpy.typing import NDArray

MetricsStatus = Literal["pending", "computing", "complete", "failed"]


@dataclass(frozen=True)
class SessionRow:
    id: str
    activity_type: str
    start_time: datetime
    end_time: datetime | None
    metrics_status: MetricsStatus


@dataclass(frozen=True)
class SamplesHR:
    rr_ms: NDArray[np.float64]
    hr_bpm: NDArray[np.float64]
    timestamp_ms: NDArray[np.int64]


@dataclass(frozen=True)
class SessionMetricsRow:
    session_id: str
    duration_s: int
    hr_avg: float
    hr_peak: int
    hr_min: int
    hr_sd: float
    rmssd_ms: float
    sdnn_ms: float
    pnn50_pct: float
    pnn20_pct: float
    rr_cleaning_quality: float
    hrv_completeness_quality: float
    algo_version: str
    # Slice 11 — workload (TRIMP + 5-zone times). Nullable for sessions that
    # predate migration 016 or where the algorithm declines to compute.
    trimp_banister: float | None = None
    time_z1_s: int | None = None
    time_z2_s: int | None = None
    time_z3_s: int | None = None
    time_z4_s: int | None = None
    time_z5_s: int | None = None
    avg_hr_pct: float | None = None
    workload_quality: float | None = None

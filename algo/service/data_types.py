"""Plain dataclasses shared between the data layer and the routes.

Kept separate from ``data.py`` to honour Rule 1 (≤150 lines per file).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

import numpy as np
from numpy.typing import NDArray

MetricsStatus = Literal[
    "pending", "computing", "complete", "complete_low_quality", "failed"
]

# Slice 11.5: rest sessions skip recovery τ. Values must match the
# ``sessions.activity_type`` CHECK constraint in migration 002. ``walker`` is
# borderline (low-intensity locomotion, no peak/decay structure) but stays
# OUT of the rest set — the algorithm's ``no_decay`` path handles it
# naturally, preserving the three-state distinction between "didn't try"
# (NULL) and "tried but no decay" (0.0). Same reasoning for ``other``.
REST_ACTIVITIES = frozenset({"stall", "grass_field", "transport", "vet"})


@dataclass(frozen=True)
class SessionRow:
    id: str
    activity_type: str
    start_time: datetime
    end_time: datetime | None
    metrics_status: MetricsStatus
    # Per-horse zone calibration overrides (migration 038). NULL falls back to
    # the species defaults baked into trimp_zones.WorkloadConfig. The horse
    # row carries these; we lift them into SessionRow so the pipeline doesn't
    # need a second round-trip to Supabase.
    hr_max_bpm: int | None = None
    hr_rest_bpm: int | None = None


@dataclass(frozen=True)
class SamplesHR:
    rr_ms: NDArray[np.float64]
    hr_bpm: NDArray[np.float64]
    timestamp_ms: NDArray[np.int64]


@dataclass(frozen=True)
class SamplesAcc:
    timestamp_ms: NDArray[np.int64]
    ax: NDArray[np.float64]
    ay: NDArray[np.float64]
    az: NDArray[np.float64]


@dataclass(frozen=True)
class LabelRow:
    session_id: str
    start_ms: int
    end_ms: int
    label_type: str  # walk|trot|canter_gallop|jump|rest|other
    jump_count: int | None
    confidence: float | None
    source: str = "auto"


@dataclass(frozen=True)
class SessionMetricsRow:
    session_id: str
    duration_s: int
    hr_avg: float
    hr_peak: int
    hr_min: int
    hr_sd: float
    # HRV outputs stay nullable (migration 036 column shape) but the
    # plausibility gate no longer nulls them — it only downgrades
    # metrics_status to 'complete_low_quality' and annotates quality_flags.
    # Horse data is baseline-noisy; nulling every flagged ride hid usable
    # signal. NULL still appears for older rows from before this change.
    rmssd_ms: float | None
    sdnn_ms: float | None
    pnn50_pct: float | None
    pnn20_pct: float | None
    rr_cleaning_quality: float
    hrv_completeness_quality: float | None
    algo_version: str
    # Structured reasons HRV was nulled, e.g. {"rr_cleaning_low": True,
    # "rmssd_implausible": True}. Empty for clean rows.
    quality_flags: dict[str, bool] = field(default_factory=dict)
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
    # Slice 11.5 — recovery τ. Three-state: NULL = not attempted (rest);
    # 0.0 = attempted-and-failed; (0,1] = R²-style. Migration 016.
    recovery_tau_s: float | None = None
    recovery_fit_quality: float | None = None

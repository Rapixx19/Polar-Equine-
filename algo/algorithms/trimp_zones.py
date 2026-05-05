"""Banister TRIMP + 5-zone time-in-zone for equine HR series.

Spec: ``docs/algorithms/05-trimp-zones.md`` (formula at :43, zones at :86-92,
quality at :98). The spec uses pandas; this implementation re-uses the same
math on ``NDArray`` inputs to avoid pulling pandas into the algo container.

Banister TRIMP (spec :43)::

    TRIMP = sum_i [ Δt_i(min) * %HRr_i * 0.64 * exp(1.92 * %HRr_i) ]

where ``%HRr = (HR - HR_rest) / (HR_max - HR_rest)`` is clipped to ``[0, 1]``.

V.0 species defaults: ``HR_max=225``, ``HR_rest=32``, ``sex_factor=1.92``.
Per-horse calibration is V.1 work — the ``horses`` table has no calibration
columns yet (migration 001).

Single public entry: ``compute(hr_bpm, t_ms, config) -> WorkloadResult``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from algorithms.version import algo_version

# Physiological filter for quality (matches filter_hr_for_stats).
HR_PHYSIO_MIN = 30.0
HR_PHYSIO_MAX = 220.0

# Inter-sample gap cap (s) — prevents reconnection gaps from inflating zone
# times. Real H10 emits at ~1Hz; spec :75 caps at 30s.
DT_CAP_S = 30.0

# Zone floors as fractions of HR_max (Z5 is ≥0.90 open-ended). Spec :88-92.
ZONE_BOUNDS_PCT: tuple[float, ...] = (0.50, 0.60, 0.70, 0.80, 0.90, 1.00)


@dataclass(frozen=True)
class WorkloadConfig:
    """V.0 species defaults; override path is V.1 per-horse calibration."""

    hr_max_bpm: float = 225.0
    hr_rest_bpm: float = 32.0
    sex_factor: float = 1.92  # Banister exponent multiplier (spec :43)


@dataclass(frozen=True)
class WorkloadResult:
    trimp_banister: float
    time_z1_s: int  # 50-60% HRmax
    time_z2_s: int  # 60-70%
    time_z3_s: int  # 70-80%
    time_z4_s: int  # 80-90%
    time_z5_s: int  # 90-100%+
    avg_hr_pct: float  # mean(filtered hr) / hr_max, range ~[0, 1+]
    quality: float  # fraction in [30, 220] bpm
    n_dropped: int  # for route-layer logging
    algo_version: str = algo_version


def compute(
    hr_bpm: NDArray[np.float64],
    t_ms: NDArray[np.int64],
    config: WorkloadConfig | None = None,
) -> WorkloadResult:
    """Compute Banister TRIMP + 5-zone time breakdown.

    Parallel arrays: ``hr_bpm[i]`` is the HR at ``t_ms[i]``. Sorted by ``t_ms``
    defensively. Empty input returns a zero result (spec :68-69; the route's
    ``filter_hr_for_stats`` guard catches "no usable HR" earlier with a 422).
    """
    cfg = config or WorkloadConfig()
    if hr_bpm.size == 0 or t_ms.size == 0:
        return _empty_result()
    if hr_bpm.size != t_ms.size:
        raise ValueError("hr_bpm and t_ms must have equal length")

    order = np.argsort(t_ms)
    t_sorted = t_ms[order].astype(np.float64)
    hr_sorted = hr_bpm[order].astype(np.float64)

    # Δt per sample (s). Prepend self → first sample contributes 0s of dwell.
    dt_s = np.diff(t_sorted, prepend=t_sorted[0]) / 1000.0
    dt_s = np.clip(dt_s, 0.0, DT_CAP_S)

    # Quality: fraction of HR in physiological range. Used by route + UI.
    valid_mask = (hr_sorted >= HR_PHYSIO_MIN) & (hr_sorted <= HR_PHYSIO_MAX)
    n_total = int(hr_sorted.size)
    n_dropped = n_total - int(np.sum(valid_mask))
    quality = float(np.sum(valid_mask) / n_total)

    # %HRr clip-to-[0,1] makes TRIMP robust to dropouts without pre-filtering
    # (HR=0 → %HRr=0 → zero contribution). Spec :79.
    hr_reserve = cfg.hr_max_bpm - cfg.hr_rest_bpm
    pct_hrr = np.clip((hr_sorted - cfg.hr_rest_bpm) / hr_reserve, 0.0, 1.0)

    minute_dt = dt_s / 60.0
    weight = 0.64 * np.exp(cfg.sex_factor * pct_hrr)  # spec :83
    trimp = float(np.sum(minute_dt * pct_hrr * weight))

    # Zone bucketing on raw HR / HR_max. Out-of-range HR (e.g. dropouts at 0)
    # falls below Z1's 50% floor → not counted in any zone. Spec :86-92.
    pct_max = hr_sorted / cfg.hr_max_bpm
    z_floors = ZONE_BOUNDS_PCT
    z1 = float(np.sum(dt_s[(pct_max >= z_floors[0]) & (pct_max < z_floors[1])]))
    z2 = float(np.sum(dt_s[(pct_max >= z_floors[1]) & (pct_max < z_floors[2])]))
    z3 = float(np.sum(dt_s[(pct_max >= z_floors[2]) & (pct_max < z_floors[3])]))
    z4 = float(np.sum(dt_s[(pct_max >= z_floors[3]) & (pct_max < z_floors[4])]))
    z5 = float(np.sum(dt_s[pct_max >= z_floors[4]]))

    # avg_hr_pct uses filtered HR for consistency with hr_avg in session_metrics.
    if int(np.sum(valid_mask)) > 0:
        avg_hr_pct = float(np.mean(hr_sorted[valid_mask]) / cfg.hr_max_bpm)
    else:
        avg_hr_pct = 0.0

    return WorkloadResult(
        trimp_banister=trimp,
        time_z1_s=int(z1),
        time_z2_s=int(z2),
        time_z3_s=int(z3),
        time_z4_s=int(z4),
        time_z5_s=int(z5),
        avg_hr_pct=avg_hr_pct,
        quality=quality,
        n_dropped=n_dropped,
    )


def _empty_result() -> WorkloadResult:
    return WorkloadResult(
        trimp_banister=0.0,
        time_z1_s=0,
        time_z2_s=0,
        time_z3_s=0,
        time_z4_s=0,
        time_z5_s=0,
        avg_hr_pct=0.0,
        quality=0.0,
        n_dropped=0,
    )

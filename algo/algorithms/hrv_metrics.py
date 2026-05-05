"""Time-domain HRV metrics from a cleaned RR series.

Single public entry: ``compute(rr_clean_ms)`` returns an ``HRVResult``.

Quality semantics (per docs/algorithms/03-hrv-metrics.md): "completeness" is
``min(1.0, n_beats/60)`` — the fraction of the 60-beat short-term target the
input reaches, independent of cleaning quality. Inputs with fewer than
``MIN_BEATS=30`` raise ``ValueError`` (caller maps to 422).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from algorithms.version import algo_version

MIN_BEATS = 30
TARGET_BEATS = 60


@dataclass
class HRVResult:
    rmssd_ms: float
    sdnn_ms: float
    pnn50_pct: float
    pnn20_pct: float
    mean_rr_ms: float
    n_beats: int
    quality: float
    algo_version: str = algo_version


def compute(rr_clean_ms: NDArray[np.float64] | list[float] | list[int]) -> HRVResult:
    rr = np.asarray(rr_clean_ms, dtype=float)
    if rr.size < MIN_BEATS:
        raise ValueError("insufficient_data")

    diffs = np.diff(rr)
    abs_diffs = np.abs(diffs)
    n_diffs = diffs.size

    rmssd = float(np.sqrt(np.mean(diffs**2)))
    sdnn = float(np.std(rr, ddof=1))
    pnn50 = float(np.sum(abs_diffs > 50.0) / n_diffs * 100.0)
    pnn20 = float(np.sum(abs_diffs > 20.0) / n_diffs * 100.0)
    mean_rr = float(np.mean(rr))
    n_beats = int(rr.size)
    quality = min(1.0, n_beats / TARGET_BEATS)

    return HRVResult(
        rmssd_ms=rmssd,
        sdnn_ms=sdnn,
        pnn50_pct=pnn50,
        pnn20_pct=pnn20,
        mean_rr_ms=mean_rr,
        n_beats=n_beats,
        quality=quality,
    )

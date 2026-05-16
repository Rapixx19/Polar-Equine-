"""Rule-based jump detector from H10 ACC. Public entry: ``detect``. Pipeline:
z-score → duration band → peak-G floor → suspension valley → 3 s clustering."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from algorithms.version import algo_version

# 8 s rolling baseline; 4 stddev catches impulses; duration band rejects EMI/sustained.
BASELINE_SEC: float = 8.0
Z_THRESHOLD: float = 4.0
MIN_DURATION_SEC: float = 0.15
MAX_DURATION_SEC: float = 2.0
MERGE_GAP_SEC: float = 0.6
# Physics gates (2026-05-15 — Emma's no-jump ride emitted 26 false positives on
# trot/walk noise). Magnitude floor + free-fall valley + 1-jump-per-3 s cap.
MIN_PEAK_G: float = 1.5
SUSPENSION_THRESHOLD_G: float = 0.2
MIN_SUSPENSION_SEC: float = 0.08
CLUSTER_GAP_SEC: float = 3.0


@dataclass(frozen=True)
class JumpEvent:
    start_ms: int
    end_ms: int
    peak_g: float  # peak gravity-removed magnitude in g
    confidence: float  # 0..1 -- peak z normalised against 2x threshold


@dataclass(frozen=True)
class JumpDetectionResult:
    events: tuple[JumpEvent, ...]
    sample_rate_hz: float
    algo_version: str = algo_version


def detect(
    timestamp_ms: NDArray[np.int64],
    ax: NDArray[np.float64],
    ay: NDArray[np.float64],
    az: NDArray[np.float64],
) -> JumpDetectionResult:
    """Detect jump impulses. Empty result on insufficient input - pipeline
    must run on legacy sessions without ACC."""
    if timestamp_ms.size == 0 or ax.size == 0:
        return JumpDetectionResult(events=(), sample_rate_hz=52.0)
    if not (ax.size == ay.size == az.size == timestamp_ms.size):
        raise ValueError("ACC arrays must have equal length")

    order = np.argsort(timestamp_ms)
    t = timestamp_ms[order].astype(np.int64)
    axs, ays, azs = ax[order], ay[order], az[order]
    sr_hz = _estimate_sample_rate(t)
    mag = _gravity_removed_magnitude(axs, ays, azs)

    baseline_n = max(8, round(BASELINE_SEC * sr_hz))
    if mag.size < baseline_n:
        return JumpDetectionResult(events=(), sample_rate_hz=sr_hz)

    z = _rolling_z(mag, baseline_n)
    above = z > Z_THRESHOLD
    if not np.any(above):
        return JumpDetectionResult(events=(), sample_rate_hz=sr_hz)

    merged = _merge_close_runs(_runs_of_true(above), max(1, round(MERGE_GAP_SEC * sr_hz)))
    min_n = max(1, round(MIN_DURATION_SEC * sr_hz))
    max_n = max(min_n + 1, round(MAX_DURATION_SEC * sr_hz))
    susp_n = max(1, round(MIN_SUSPENSION_SEC * sr_hz))
    raw: list[JumpEvent] = []
    for start, end in merged:
        if not (min_n <= end - start <= max_n):
            continue
        peak_idx = start + int(np.argmax(np.abs(mag[start:end])))
        peak_g = float(mag[peak_idx])
        if peak_g < MIN_PEAK_G:
            continue
        quiet = np.abs(mag[start:end]) < SUSPENSION_THRESHOLD_G
        if not np.any(quiet) or not any(
            (b - a) >= susp_n for a, b in _runs_of_true(quiet)
        ):
            continue
        confidence = max(0.0, min(1.0, float(z[peak_idx]) / (2.0 * Z_THRESHOLD)))
        raw.append(JumpEvent(int(t[start]), int(t[end - 1]), peak_g, confidence))
    # Cluster: one detection per 3 s — keep the strongest event per cluster.
    cluster_gap_ms = int(CLUSTER_GAP_SEC * 1000)
    kept: list[JumpEvent] = []
    for ev in raw:
        if kept and ev.start_ms - kept[-1].end_ms <= cluster_gap_ms:
            if ev.confidence > kept[-1].confidence:
                kept[-1] = ev
        else:
            kept.append(ev)
    return JumpDetectionResult(events=tuple(kept), sample_rate_hz=sr_hz)


def _estimate_sample_rate(t_ms: NDArray[np.int64]) -> float:
    if t_ms.size < 2:
        return 52.0
    dt = np.diff(t_ms.astype(np.float64))
    dt = dt[dt > 0]
    median_dt_ms = float(np.median(dt)) if dt.size else 0.0
    return 1000.0 / median_dt_ms if median_dt_ms > 0 else 52.0


def _gravity_removed_magnitude(
    ax: NDArray[np.float64],
    ay: NDArray[np.float64],
    az: NDArray[np.float64],
) -> NDArray[np.float64]:
    return np.abs(np.sqrt(ax * ax + ay * ay + az * az) - 1.0)


def _rolling_z(mag: NDArray[np.float64], window_n: int) -> NDArray[np.float64]:
    # Centred rolling median + MAD (1.4826 ~ stddev); robust to jumps in baseline.
    n = mag.size
    half = window_n // 2
    z = np.zeros(n, dtype=np.float64)
    for i in range(n):
        win = mag[max(0, i - half) : min(n, i + half + 1)]
        med = float(np.median(win))
        scale = max(1.4826 * float(np.median(np.abs(win - med))), 1e-3)
        z[i] = (mag[i] - med) / scale
    return z


def _runs_of_true(mask: NDArray[np.bool_]) -> list[tuple[int, int]]:
    if mask.size == 0:
        return []
    edges = np.diff(mask.astype(np.int8))
    starts = list(np.where(edges == 1)[0] + 1)
    ends = list(np.where(edges == -1)[0] + 1)
    if mask[0]:
        starts.insert(0, 0)
    if mask[-1]:
        ends.append(mask.size)
    return list(zip(starts, ends, strict=True))


def _merge_close_runs(runs: list[tuple[int, int]], gap_n: int) -> list[tuple[int, int]]:
    if not runs:
        return []
    merged: list[tuple[int, int]] = [runs[0]]
    for start, end in runs[1:]:
        prev_start, prev_end = merged[-1]
        if start - prev_end <= gap_n:
            merged[-1] = (prev_start, end)
        else:
            merged.append((start, end))
    return merged

"""Rule-based gait classifier from H10 girth-strap ACC. V1: windowed FFT on the
gravity-removed magnitude + RMS thresholds. Labels match migration 003's
``labels`` enum -- canter+gallop are bundled (lead-leg asymmetry detection
deferred to v2). Stride bands: walk 0.5-1.5 Hz, trot 1.5-2.5 Hz, canter_gallop
2.5-4.5 Hz. Jumps are event-shaped -- see ``jump_detector.py``."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from algorithms.version import algo_version

# Windowing + stride-frequency search band. RMS thresholds are on the
# gravity-removed magnitude in g-units; cutoffs are rough and live for tuning
# from hand-labelled rides in v2.
WINDOW_SEC: float = 4.0
HOP_SEC: float = 2.0
FREQ_LO_HZ: float = 0.5
FREQ_HI_HZ: float = 5.0
REST_RMS_G: float = 0.05
MIN_LABEL_RMS_G: float = 0.10
WALK_LO_HZ: float = 0.5
WALK_HI_HZ: float = 1.5
TROT_HI_HZ: float = 2.5
CANTER_HI_HZ: float = 4.5
MIN_SEGMENT_SEC: float = 4.0

GaitLabel = str  # one of: walk, trot, canter_gallop, rest, other


@dataclass(frozen=True)
class GaitSegment:
    start_ms: int
    end_ms: int
    label: GaitLabel
    confidence: float  # 0..1 — currently just dominant-peak prominence


@dataclass(frozen=True)
class ClassifierResult:
    segments: tuple[GaitSegment, ...]
    n_windows: int
    sample_rate_hz: float
    algo_version: str = algo_version


def classify(
    timestamp_ms: NDArray[np.int64],
    ax: NDArray[np.float64],
    ay: NDArray[np.float64],
    az: NDArray[np.float64],
) -> ClassifierResult:
    """Classify ACC samples into gait segments. Empty input → empty result;
    sample-rate falls back to 52 Hz (the H10 PMD rate) when <2 samples exist."""
    if timestamp_ms.size == 0 or ax.size == 0:
        return ClassifierResult(segments=(), n_windows=0, sample_rate_hz=52.0)
    if not (ax.size == ay.size == az.size == timestamp_ms.size):
        raise ValueError("ACC arrays must have equal length")

    order = np.argsort(timestamp_ms)
    t = timestamp_ms[order].astype(np.float64)
    axs, ays, azs = ax[order], ay[order], az[order]
    sr_hz = _estimate_sample_rate(t)
    mag = _gravity_removed_magnitude(axs, ays, azs)

    window_n = max(8, round(WINDOW_SEC * sr_hz))
    hop_n = max(2, round(HOP_SEC * sr_hz))
    if mag.size < window_n:
        return ClassifierResult(segments=(), n_windows=0, sample_rate_hz=sr_hz)

    raw: list[GaitSegment] = []
    for start in range(0, mag.size - window_n + 1, hop_n):
        end = start + window_n
        win = mag[start:end]
        rms = float(np.sqrt(np.mean(win * win)))
        peak_freq, prominence = _dominant_stride_freq(win, sr_hz)
        label = _label_for(rms, peak_freq)
        start_ms = int(t[start] - t[0])
        end_ms = int(t[end - 1] - t[0])
        raw.append(
            GaitSegment(start_ms=start_ms, end_ms=end_ms, label=label, confidence=prominence)
        )

    merged = _merge_and_drop(raw, min_duration_ms=int(MIN_SEGMENT_SEC * 1000))
    return ClassifierResult(segments=tuple(merged), n_windows=len(raw), sample_rate_hz=sr_hz)


def _estimate_sample_rate(t_ms: NDArray[np.float64]) -> float:
    if t_ms.size < 2:
        return 52.0
    dt = np.diff(t_ms)
    dt = dt[dt > 0]
    median_dt_ms = float(np.median(dt)) if dt.size else 0.0
    return 1000.0 / median_dt_ms if median_dt_ms > 0 else 52.0


def _gravity_removed_magnitude(
    ax: NDArray[np.float64], ay: NDArray[np.float64], az: NDArray[np.float64]
) -> NDArray[np.float64]:
    return np.sqrt(ax * ax + ay * ay + az * az) - 1.0


def _dominant_stride_freq(window: NDArray[np.float64], sr_hz: float) -> tuple[float, float]:
    if window.size < 4:
        return 0.0, 0.0
    freqs = np.fft.rfftfreq(window.size, d=1.0 / sr_hz)
    spec = np.abs(np.fft.rfft(window - float(np.mean(window))))
    in_band = (freqs >= FREQ_LO_HZ) & (freqs <= FREQ_HI_HZ)
    band_spec = spec[in_band]
    if band_spec.size == 0 or float(np.max(band_spec)) == 0.0:
        return 0.0, 0.0
    idx = int(np.argmax(band_spec))
    total = float(np.sum(band_spec))
    prominence = float(band_spec[idx] / total) if total > 0 else 0.0
    return float(freqs[in_band][idx]), prominence


def _label_for(rms: float, freq_hz: float) -> GaitLabel:
    if rms < REST_RMS_G:
        return "rest"
    if rms < MIN_LABEL_RMS_G or freq_hz <= 0.0:
        return "other"
    if WALK_LO_HZ <= freq_hz < WALK_HI_HZ:
        return "walk"
    if WALK_HI_HZ <= freq_hz < TROT_HI_HZ:
        return "trot"
    if TROT_HI_HZ <= freq_hz <= CANTER_HI_HZ:
        return "canter_gallop"
    return "other"


def _merge_and_drop(raw: list[GaitSegment], min_duration_ms: int) -> list[GaitSegment]:
    if not raw:
        return []
    merged: list[GaitSegment] = []
    cur_start, cur_end, cur_label = raw[0].start_ms, raw[0].end_ms, raw[0].label
    cur_confs: list[float] = [raw[0].confidence]
    for seg in raw[1:]:
        if seg.label == cur_label:
            cur_end = seg.end_ms
            cur_confs.append(seg.confidence)
        else:
            merged.append(GaitSegment(cur_start, cur_end, cur_label, float(np.mean(cur_confs))))
            cur_start, cur_end, cur_label = seg.start_ms, seg.end_ms, seg.label
            cur_confs = [seg.confidence]
    merged.append(GaitSegment(cur_start, cur_end, cur_label, float(np.mean(cur_confs))))
    return [s for s in merged if (s.end_ms - s.start_ms) >= min_duration_ms]

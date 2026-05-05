"""RR-interval cleaning: bounds + AV-block guard + Lipponen-Tarvainen via neurokit2.

Single public entry: ``clean(rr_ms, config)`` returns a ``CleaningResult``.

Quality formula (locked in build plan): ``max(0.0, 1.0 - n_corrected/n_total)``.
``n_total`` is the input length (pre-cleaning); zero-input raises ``ValueError``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import neurokit2 as nk  # type: ignore[import-untyped]
import numpy as np
from numpy.typing import NDArray

from algorithms.version import algo_version


@dataclass(frozen=True)
class CleaningConfig:
    rr_min_ms: int = 300
    rr_max_ms: int = 3000
    iterative: bool = True
    flag_av_block: bool = True
    av_block_ratio: float = 1.6  # ratio threshold for 1:2 alternation


@dataclass
class CleaningResult:
    rr_clean_ms: NDArray[np.float64]
    n_corrected: int
    n_total: int
    quality: float
    av_block_segments: list[tuple[int, int]] = field(default_factory=list)
    algo_version: str = algo_version


def clean(
    rr_ms: NDArray[np.float64] | list[int] | list[float],
    config: CleaningConfig | None = None,
) -> CleaningResult:
    cfg = config or CleaningConfig()
    rr = np.asarray(rr_ms, dtype=float)
    n_total = int(rr.size)
    if n_total == 0:
        raise ValueError("no_valid_beats")

    in_bounds = (rr >= cfg.rr_min_ms) & (rr <= cfg.rr_max_ms)
    rr_bounded = np.where(in_bounds, rr, np.nan)

    if not np.isfinite(rr_bounded).any():
        raise ValueError("no_valid_beats")

    rr_interp = _interpolate_nan(rr_bounded)

    av_segments: list[tuple[int, int]] = (
        _detect_av_block(rr_interp, cfg.av_block_ratio) if cfg.flag_av_block else []
    )

    rr_clean = _run_fixpeaks(rr_interp, iterative=cfg.iterative)

    if av_segments:
        for start, end in av_segments:
            rr_clean[start : end + 1] = rr_interp[start : end + 1]

    n_corrected = int(np.sum(~np.isclose(rr_clean, rr_interp, atol=5.0)))
    n_bounds_corrected = int(np.sum(~in_bounds))
    n_corrected_total = max(n_corrected, n_bounds_corrected)

    quality = max(0.0, 1.0 - n_corrected_total / n_total)

    return CleaningResult(
        rr_clean_ms=rr_clean,
        n_corrected=n_corrected_total,
        n_total=n_total,
        quality=quality,
        av_block_segments=av_segments,
    )


def _interpolate_nan(rr: NDArray[np.float64]) -> NDArray[np.float64]:
    out = rr.copy()
    nan_mask = ~np.isfinite(out)
    if not nan_mask.any():
        return out
    valid_idx = np.flatnonzero(~nan_mask)
    if valid_idx.size == 0:
        return out
    nan_idx = np.flatnonzero(nan_mask)
    out[nan_mask] = np.interp(nan_idx, valid_idx, out[valid_idx])
    return out


def _detect_av_block(
    rr: NDArray[np.float64], ratio_threshold: float
) -> list[tuple[int, int]]:
    if rr.size < 4:
        return []
    ratios = rr[1:] / rr[:-1]
    high = ratios > ratio_threshold
    low = ratios < (1.0 / ratio_threshold)
    segments: list[tuple[int, int]] = []
    start: int | None = None
    end = 0
    for i in range(ratios.size - 1):
        is_alt = bool((high[i] and low[i + 1]) or (low[i] and high[i + 1]))
        if is_alt:
            if start is None:
                start = i
            end = i + 2
        elif start is not None:
            segments.append((start, end))
            start = None
    if start is not None:
        segments.append((start, end))
    return segments


def _run_fixpeaks(rr_ms: NDArray[np.float64], iterative: bool) -> NDArray[np.float64]:
    sampling_rate = 10_000
    peaks = np.concatenate([[0.0], np.cumsum(rr_ms) * (sampling_rate / 1000.0)])
    peaks_int = np.round(peaks).astype(int)
    _, peaks_clean = nk.signal_fixpeaks(
        peaks_int,
        sampling_rate=sampling_rate,
        iterative=iterative,
        method="kubios",
    )
    rr_clean = np.diff(np.asarray(peaks_clean, dtype=float)) * (1000.0 / sampling_rate)
    n = rr_ms.size
    if rr_clean.size == n:
        return rr_clean
    if rr_clean.size > n:
        return rr_clean[:n]
    pad_value = float(rr_clean[-1]) if rr_clean.size else float(np.nanmean(rr_ms))
    pad = np.full(n - rr_clean.size, pad_value, dtype=float)
    return np.concatenate([rr_clean, pad])

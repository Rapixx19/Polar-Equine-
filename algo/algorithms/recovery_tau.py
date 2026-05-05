"""Recovery τ via single-exponential decay fit.

Spec: ``docs/algorithms/04-recovery-tau.md`` (model :37, algorithm :50-56,
bounds :100). Pure numpy + scipy on a 1-Hz uniform grid; no pandas, no
logging, no Supabase. Caller (route) skips rest sessions.
Three-state ``fit_quality`` (matches migration 016 comment):
``NULL`` = not attempted (rest); ``0.0`` = attempted-and-failed;
``(0.0, 1.0]`` = ``1 - rmse / dynamic_range``. Entry: ``fit()``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import curve_fit
from scipy.signal import medfilt

from algorithms.version import algo_version

FitReason = Literal["ok", "no_peak", "no_decay", "fit_failed", "dropout_during_decay"]
MIN_SAMPLES = 30  # spec :64 — same threshold as HRV


@dataclass(frozen=True)
class RecoveryConfig:
    min_decay_seconds: int = 60  # spec :18
    min_decay_drop_bpm: int = 20  # spec :19
    fit_window_seconds: int = 300  # spec :20
    detect_peak_window_s: int = 30  # spec :21
    # Linear interp across a >10 s dropout fabricates a smooth ramp and
    # biases τ downward. Reject the fit instead.
    max_gap_s: int = 10


@dataclass(frozen=True)
class RecoveryResult:
    tau_s: float | None  # None ⇔ not fitted; (0, ∞) ⇔ success
    fit_quality: float  # 0.0 = attempted-and-failed, (0,1] = R²-style
    reason: FitReason
    # Diagnostics — derivable from samples_hr; not persisted (Slice 11.5 v2 dec. B).
    hr_peak_bpm: float | None = None
    hr_baseline_bpm: float | None = None
    rmse_bpm: float | None = None
    n_samples: int = 0
    algo_version: str = algo_version


def fit(
    hr_bpm: NDArray[np.float64],
    t_ms: NDArray[np.int64],
    config: RecoveryConfig | None = None,
) -> RecoveryResult:
    """Fit τ to the post-peak HR decay; returns three-state ``fit_quality``."""
    cfg = config or RecoveryConfig()
    if hr_bpm.size != t_ms.size:
        raise ValueError("hr_bpm and t_ms must have equal length")
    if hr_bpm.size < MIN_SAMPLES:
        return _failed(reason="no_peak", n=hr_bpm.size)

    order = np.argsort(t_ms)
    t_sorted = t_ms[order].astype(np.int64)
    hr_sorted = hr_bpm[order].astype(np.float64)
    hr_u, t_u = _resample_uniform(hr_sorted, t_sorted, fs=1.0)
    if hr_u.size < MIN_SAMPLES:
        return _failed(reason="no_peak", n=hr_u.size)

    # 5-sample (=5 s on 1-Hz grid) median filter — spec :51 uses rolling median.
    hr_smooth = medfilt(hr_u, kernel_size=5).astype(np.float64)
    peak_idx = int(np.argmax(hr_smooth))
    peak_t = int(t_u[peak_idx])
    peak_hr = float(hr_smooth[peak_idx])

    decay_end_t = peak_t + cfg.fit_window_seconds * 1000
    decay_mask = (t_u >= peak_t) & (t_u <= decay_end_t)
    decay_t = t_u[decay_mask]
    decay_hr = hr_smooth[decay_mask]

    short = decay_t.size < 2 or (int(decay_t[-1]) - int(decay_t[0])) < cfg.min_decay_seconds * 1000
    shallow = peak_hr - float(np.min(decay_hr)) < cfg.min_decay_drop_bpm
    if short or shallow:
        return _failed(reason="no_decay", n=int(decay_hr.size), peak_hr=peak_hr)

    # Gap check on ORIGINAL irregular timestamps inside the decay window —
    # resampled grid is uniform by construction.
    orig_in_window = t_sorted[(t_sorted >= peak_t) & (t_sorted <= decay_end_t)]
    if orig_in_window.size > 1:
        max_gap_ms = int(np.max(np.diff(orig_in_window)))
        if max_gap_ms > cfg.max_gap_s * 1000:
            return _failed(reason="dropout_during_decay", n=int(decay_hr.size), peak_hr=peak_hr)

    t_rel_s = (decay_t - peak_t).astype(np.float64) / 1000.0
    # Spec :87 model order (baseline, amplitude, tau); bounds :100.
    # TODO Slice 11.5+: tighten τ upper bound 600→~300 s. Art 1990 / Marlin 2002
    # put fatigued τ at >200 s; τ>300 s = incomplete decay, not signal.
    guess_baseline = float(np.mean(decay_hr[-min(10, decay_hr.size) :]))
    guess_amplitude = max(peak_hr - guess_baseline, 5.0)
    p0 = [guess_baseline, guess_amplitude, 90.0]
    bounds = ([20.0, 5.0, 5.0], [120.0, 200.0, 600.0])

    try:
        popt, _ = curve_fit(_model, t_rel_s, decay_hr, p0=p0, bounds=bounds, maxfev=2000)
    except (RuntimeError, ValueError):
        return _failed(reason="fit_failed", n=int(decay_hr.size), peak_hr=peak_hr)

    baseline, amplitude, tau = (float(p) for p in popt)
    predicted = _model(t_rel_s, baseline, amplitude, tau)
    rmse = float(np.sqrt(np.mean((decay_hr - predicted) ** 2)))
    dynamic_range = max(peak_hr - baseline, 1.0)
    quality = max(0.0, 1.0 - (rmse / dynamic_range))

    return RecoveryResult(
        tau_s=tau,
        fit_quality=quality,
        reason="ok",
        hr_peak_bpm=peak_hr,
        hr_baseline_bpm=baseline,
        rmse_bpm=rmse,
        n_samples=int(decay_hr.size),
    )


def _model(
    t: NDArray[np.float64], baseline: float, amplitude: float, tau: float
) -> NDArray[np.float64]:
    return baseline + amplitude * np.exp(-t / tau)


def _resample_uniform(
    hr_bpm: NDArray[np.float64], t_ms: NDArray[np.int64], fs: float = 1.0
) -> tuple[NDArray[np.float64], NDArray[np.int64]]:
    """Resample (hr, t) onto a uniform fs-Hz grid via linear interp."""
    period_ms = int(1000.0 / fs)
    t_start, t_end = int(t_ms[0]), int(t_ms[-1])
    if t_end <= t_start:
        return hr_bpm.astype(np.float64), t_ms.astype(np.int64)
    t_uniform = np.arange(t_start, t_end + 1, period_ms, dtype=np.int64)
    hr_uniform = np.interp(t_uniform.astype(np.float64), t_ms.astype(np.float64), hr_bpm)
    return hr_uniform.astype(np.float64), t_uniform


def _failed(*, reason: FitReason, n: int = 0, peak_hr: float | None = None) -> RecoveryResult:
    """Attempted-but-failed: tau_s=None, fit_quality=0.0."""
    return RecoveryResult(
        tau_s=None, fit_quality=0.0, reason=reason, hr_peak_bpm=peak_hr, n_samples=n
    )

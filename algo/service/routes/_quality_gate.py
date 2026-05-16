"""HRV plausibility gate (migration 036).

Run after ``hrv_metrics.compute()``; returns a dict of flags + a boolean for
whether HRV outputs should be nulled before write. Kept separate from
``_pipeline.py`` to respect Rule 1's 150-line budget and to keep the policy
constants visible in one place.

Thresholds (sourced from equine HRV literature, see thesis refs):
- RR cleaning quality < 0.5 → more than half the intervals were artefacts;
  Task Force 1996 recommends rejecting recordings with >5% ectopics, so 0.5
  is already generous.
- RMSSD > 300 ms → biologically implausible; equine resting RMSSD sits at
  50–200 ms (Cottin 2013, Bisplinghoff 2018).
- SDNN > 300 ms → same envelope; flag for symmetry with RMSSD.

When any flag fires, the caller should null the four HRV fields
(rmssd_ms, sdnn_ms, pnn50_pct, pnn20_pct) and downgrade the session to
``complete_low_quality`` rather than ``complete``.
"""

from __future__ import annotations

from dataclasses import dataclass

RR_CLEANING_MIN_QUALITY = 0.5
RMSSD_MAX_PLAUSIBLE_MS = 300.0
SDNN_MAX_PLAUSIBLE_MS = 300.0


@dataclass(frozen=True)
class QualityVerdict:
    flags: dict[str, bool]
    hrv_unreliable: bool


def evaluate_hrv_quality(
    *, rr_cleaning_quality: float, rmssd_ms: float, sdnn_ms: float
) -> QualityVerdict:
    """Decide whether the computed HRV outputs are trustworthy.

    Returns flags keyed by reason. ``hrv_unreliable`` is True iff any flag is
    set; the caller uses it to null HRV fields and set ``metrics_status``.
    """
    flags: dict[str, bool] = {}
    if rr_cleaning_quality < RR_CLEANING_MIN_QUALITY:
        flags["rr_cleaning_low"] = True
    if rmssd_ms > RMSSD_MAX_PLAUSIBLE_MS:
        flags["rmssd_implausible"] = True
    if sdnn_ms > SDNN_MAX_PLAUSIBLE_MS:
        flags["sdnn_implausible"] = True
    return QualityVerdict(flags=flags, hrv_unreliable=bool(flags))

"""Gait + jump auto-labelling. Called from the compute pipeline after metrics.

Isolated module so a failure here can't fail the HRV/workload write. The
caller wraps ``label_session_from_acc`` in a try/except and logs; metrics_status
stays ``complete`` even when ACC is missing or the classifier raises.

Why merge in the writer: the classifier returns per-window or per-event rows
and the ``labels`` table happily accepts overlap, but our /admin timeline
renders cleanest with one auto row per gait stretch. Jumps are written as
their own rows alongside the gait stretches — overlap is intentional, so a
jump within a canter is queryable as both.
"""

from __future__ import annotations

import structlog

from algorithms import gait_classifier, jump_detector
from service.data_acc import delete_auto_labels, read_acc_samples, write_labels
from service.data_types import LabelRow

log = structlog.get_logger()

# Layer 1: drop jump events that don't overlap a canter_gallop segment (±2 s
# margin for transitions). Real jumps happen from canter — Emma's 2026-05-15
# walk/trot session emitted 26 detections with zero ground-truth jumps; this
# gate kills almost all of them by requiring the surrounding gait state to
# match the jump physics.
GAIT_GATE_MARGIN_MS: int = 2000
JUMP_GAIT_LABEL: str = "canter_gallop"


def label_session_from_acc(session_id: str) -> int:
    """Run gait + jump classifiers on a session's ACC stream, write labels.

    Returns the number of label rows written (gait segments + jump events).
    Caller is responsible for isolating exceptions; this function raises on
    DB errors so the caller can log the failure clearly.
    """
    samples = read_acc_samples(session_id)
    if samples.timestamp_ms.size == 0:
        log.info("gait.no_acc_samples", session_id=session_id)
        return 0

    gait = gait_classifier.classify(samples.timestamp_ms, samples.ax, samples.ay, samples.az)
    jumps = jump_detector.detect(samples.timestamp_ms, samples.ax, samples.ay, samples.az)

    rows: list[LabelRow] = []
    for seg in gait.segments:
        rows.append(
            LabelRow(
                session_id=session_id,
                start_ms=seg.start_ms,
                end_ms=seg.end_ms,
                label_type=seg.label,
                jump_count=None,
                confidence=seg.confidence,
                source="auto",
            )
        )
    # Jump timestamps are absolute (ms since epoch); rebase to session start so
    # they match the gait segments' relative-ms convention.
    t0 = int(samples.timestamp_ms[0])
    canter_intervals = [
        (seg.start_ms, seg.end_ms) for seg in gait.segments if seg.label == JUMP_GAIT_LABEL
    ]
    n_jumps_pre_gate = len(jumps.events)
    kept_jumps = [
        ev
        for ev in jumps.events
        if _jump_in_canter(ev.start_ms - t0, ev.end_ms - t0, canter_intervals)
    ]
    for ev in kept_jumps:
        rows.append(
            LabelRow(
                session_id=session_id,
                start_ms=ev.start_ms - t0,
                end_ms=ev.end_ms - t0,
                label_type="jump",
                jump_count=1,
                confidence=ev.confidence,
                source="auto",
            )
        )

    delete_auto_labels(session_id)
    write_labels(rows)
    log.info(
        "gait.labelled",
        session_id=session_id,
        n_segments=len(gait.segments),
        n_jumps_raw=n_jumps_pre_gate,
        n_jumps_after_gait_gate=len(kept_jumps),
        sample_rate_hz=gait.sample_rate_hz,
    )
    return len(rows)


def _jump_in_canter(
    ev_start_rel_ms: int, ev_end_rel_ms: int, canter_intervals: list[tuple[int, int]]
) -> bool:
    lo = ev_start_rel_ms - GAIT_GATE_MARGIN_MS
    hi = ev_end_rel_ms + GAIT_GATE_MARGIN_MS
    return any(hi >= seg_start and lo <= seg_end for seg_start, seg_end in canter_intervals)

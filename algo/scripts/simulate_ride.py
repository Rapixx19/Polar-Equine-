"""Run the gait + jump classifiers on a synthetic 90-min training session.

Timeline (matches Ferdinand's typical structured ride 2026-05-15):

    00:00 - 15:00  walk    warmup
    15:00 - 35:00  trot
    35:00 - 45:00  walk
    45:00 - 60:00  canter_gallop
    60:00 - 80:00  jumping (canter_gallop + a jump every ~30 s)
    80:00 - 90:00  walk    cooldown

Vertical bounce is sin(2 pi f t) at amplitudes tuned per gait. Jumps are
half-second +1.5 g impulses superimposed on top of the canter signal in the
jumping block. Output: per-block expected-vs-detected confusion, jump count,
and confidence stats. No I/O against Supabase; nothing leaves this script.

Run with::

    uv run python -m scripts.simulate_ride
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from algorithms.gait_classifier import classify
from algorithms.jump_detector import detect

SR_HZ: float = 52.0
RNG = np.random.default_rng(2026)


@dataclass(frozen=True)
class Block:
    label: str
    duration_s: float
    stride_hz: float  # 0 for rest
    amplitude_g: float
    jump_every_s: float | None = None  # None disables jumps in this block


TIMELINE: tuple[Block, ...] = (
    Block("walk", 15 * 60, stride_hz=1.0, amplitude_g=0.25),
    Block("trot", 20 * 60, stride_hz=2.0, amplitude_g=0.55),
    Block("walk", 10 * 60, stride_hz=1.0, amplitude_g=0.25),
    Block("canter_gallop", 15 * 60, stride_hz=3.2, amplitude_g=0.7),
    Block("canter_gallop", 20 * 60, stride_hz=3.2, amplitude_g=0.75, jump_every_s=30.0),
    Block("walk", 10 * 60, stride_hz=1.0, amplitude_g=0.22),
)


BlockArrays = tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]
TruthBlock = tuple[float, float, str]


def _synth_block(block: Block, t0_s: float) -> BlockArrays:
    n = round(block.duration_s * SR_HZ)
    t_local = np.arange(n) / SR_HZ
    t_abs_ms = ((t0_s + t_local) * 1000).astype(np.int64)
    bounce = block.amplitude_g * np.sin(2 * np.pi * block.stride_hz * t_local)
    az = 1.0 + bounce + RNG.normal(0.0, 0.02, n)
    ax = RNG.normal(0.0, 0.03, n)
    ay = RNG.normal(0.0, 0.03, n)
    if block.jump_every_s is not None:
        spacing_n = round(block.jump_every_s * SR_HZ)
        pulse_n = round(0.5 * SR_HZ)
        for start in range(spacing_n, n - pulse_n, spacing_n):
            # Half-second elevated bounce on top of the canter signal.
            az[start : start + pulse_n] += 1.5
    return t_abs_ms, ax.astype(np.float64), ay.astype(np.float64), az.astype(np.float64)


def _build_timeline() -> tuple[
    np.ndarray, np.ndarray, np.ndarray, np.ndarray, list[TruthBlock]
]:
    chunks = []
    truth: list[tuple[float, float, str]] = []
    t0 = 0.0
    for b in TIMELINE:
        chunks.append(_synth_block(b, t0))
        truth.append((t0, t0 + b.duration_s, b.label))
        t0 += b.duration_s
    ts = np.concatenate([c[0] for c in chunks])
    ax = np.concatenate([c[1] for c in chunks])
    ay = np.concatenate([c[2] for c in chunks])
    az = np.concatenate([c[3] for c in chunks])
    return ts, ax, ay, az, truth


def _confusion(
    detected: list[tuple[int, int, str]], truth: list[TruthBlock]
) -> dict[str, dict[str, float]]:
    # Time-per-(truth_label, detected_label) in seconds. Iterate over the truth
    # blocks; for each, find detected segments that overlap and accumulate.
    matrix: dict[str, dict[str, float]] = {}
    for t_lo_s, t_hi_s, t_label in truth:
        row = matrix.setdefault(t_label, {})
        for d_lo_ms, d_hi_ms, d_label in detected:
            d_lo_s = d_lo_ms / 1000.0
            d_hi_s = d_hi_ms / 1000.0
            overlap = max(0.0, min(t_hi_s, d_hi_s) - max(t_lo_s, d_lo_s))
            if overlap > 0:
                row[d_label] = row.get(d_label, 0.0) + overlap
    return matrix


def _print_confusion(matrix: dict[str, dict[str, float]]) -> None:
    labels = sorted({col for row in matrix.values() for col in row} | set(matrix.keys()))
    header = "truth \\ detected  | " + " | ".join(f"{c:>14}" for c in labels)
    print(header)
    print("-" * len(header))
    for truth_label in sorted(matrix.keys()):
        cells = (f"{matrix[truth_label].get(c, 0.0):>14.1f}" for c in labels)
        print(f"{truth_label:<17} | " + " | ".join(cells))


def main() -> None:
    ts, ax, ay, az, truth = _build_timeline()
    print(f"Synth timeline: {ts.size} samples ({ts.size / SR_HZ / 60:.1f} min @ {SR_HZ} Hz)")
    gait = classify(ts, ax, ay, az)
    jumps = detect(ts, ax, ay, az)

    # Segments come back with start_ms relative to t[0]; that's already the
    # absolute synth-clock here because we started at 0.
    detected_segments = [(s.start_ms, s.end_ms, s.label) for s in gait.segments]
    print(f"\nGait segments emitted: {len(gait.segments)}; n_windows={gait.n_windows}")
    expected_jumps = sum(1 for b in TIMELINE if b.jump_every_s) * (20 * 60 // 30)
    print(
        f"Jump events: {len(jumps.events)}  "
        f"(expected ~{expected_jumps:.0f} in the jumping block)"
    )

    matrix = _confusion(detected_segments, truth)
    print("\nTime-overlap matrix (seconds):")
    _print_confusion(matrix)

    print("\nJump confidence: " + (
        f"min={min(e.confidence for e in jumps.events):.3f} "
        f"max={max(e.confidence for e in jumps.events):.3f} "
        f"mean={sum(e.confidence for e in jumps.events) / len(jumps.events):.3f}"
        if jumps.events else "no events"
    ))


if __name__ == "__main__":
    main()

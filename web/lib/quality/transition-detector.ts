// Pure transition detector. Turns a stream of (state, t_ms) ticks into
// sealed signal-quality events: contiguous spans of non-"good" state.
//
// Two-state-machine: at any moment we either have an open event of kind
// "weak" | "lost", or we don't. The detector decides three things per tick:
//   - open a fresh event (transition from good → non-good)
//   - seal the current event (transition from non-good → good, OR from
//     "weak" → "lost" / "lost" → "weak" which is also a boundary)
//   - do nothing (still in the same state)
//
// Pure: no Date.now, no I/O. Callers supply t_ms (typically
// performance.now() - startedAt for session-relative timestamps).

import type { QualityState } from "@/lib/ble/capture-quality";

export type SignalEventKind = "weak" | "lost";

export type SignalEvent = {
  kind: SignalEventKind;
  t_start_ms: number;
  t_end_ms: number;
};

export type DetectorState = {
  open: { kind: SignalEventKind; t_start_ms: number } | null;
};

export function initialDetectorState(): DetectorState {
  return { open: null };
}

export function isNonGood(state: QualityState): state is SignalEventKind {
  return state === "weak" || state === "lost";
}

export type StepResult = {
  next: DetectorState;
  emit: SignalEvent | null;
};

// Single transition step. If we just left a non-good state, emit it; if we
// just entered one, record the start. State-to-state transitions between
// "weak" and "lost" seal the old and open the new in the same tick (the
// emit is the sealed old event; the new `open` is set on `next`).
export function step(prev: DetectorState, state: QualityState, t_ms: number): StepResult {
  // No open event.
  if (!prev.open) {
    if (isNonGood(state)) {
      return { next: { open: { kind: state, t_start_ms: t_ms } }, emit: null };
    }
    return { next: prev, emit: null };
  }
  // Open event, still in same kind — nothing to do.
  if (prev.open.kind === state) return { next: prev, emit: null };
  // Open event, transition to good — seal and close.
  const sealed: SignalEvent = {
    kind: prev.open.kind,
    t_start_ms: prev.open.t_start_ms,
    t_end_ms: t_ms,
  };
  if (state === "good") {
    return { next: { open: null }, emit: sealed };
  }
  // Open event, transition to *different* non-good kind — seal old, open new.
  return {
    next: { open: { kind: state, t_start_ms: t_ms } },
    emit: sealed,
  };
}

// Called at session stop. Seals any in-flight event so it's not lost.
export function finalize(prev: DetectorState, t_ms: number): SignalEvent | null {
  if (!prev.open) return null;
  return {
    kind: prev.open.kind,
    t_start_ms: prev.open.t_start_ms,
    t_end_ms: t_ms,
  };
}

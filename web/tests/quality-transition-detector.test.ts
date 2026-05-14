import { describe, expect, it } from "vitest";

import {
  finalize,
  initialDetectorState,
  step,
  type SignalEvent,
} from "@/lib/quality/transition-detector";
import type { QualityState } from "@/lib/ble/capture-quality";

// Drive a sequence of (state, t_ms) ticks through the detector and collect
// every emitted event plus the final state at session stop.
function run(
  ticks: Array<{ state: QualityState; t: number }>,
  stopAt: number,
): SignalEvent[] {
  let state = initialDetectorState();
  const emitted: SignalEvent[] = [];
  for (const tick of ticks) {
    const { next, emit } = step(state, tick.state, tick.t);
    state = next;
    if (emit) emitted.push(emit);
  }
  const tail = finalize(state, stopAt);
  if (tail) emitted.push(tail);
  return emitted;
}

describe("transition-detector", () => {
  it("emits nothing for an all-good session", () => {
    const events = run(
      [
        { state: "good", t: 1000 },
        { state: "good", t: 2000 },
        { state: "good", t: 3000 },
      ],
      4000,
    );
    expect(events).toEqual([]);
  });

  it("seals a weak interval when state returns to good", () => {
    const events = run(
      [
        { state: "good", t: 1000 },
        { state: "weak", t: 2000 },
        { state: "weak", t: 3000 },
        { state: "good", t: 4000 },
      ],
      5000,
    );
    expect(events).toEqual([{ kind: "weak", t_start_ms: 2000, t_end_ms: 4000 }]);
  });

  it("seals a lost interval at stop if never recovered", () => {
    const events = run(
      [
        { state: "good", t: 1000 },
        { state: "lost", t: 2000 },
        { state: "lost", t: 3000 },
      ],
      4500,
    );
    expect(events).toEqual([{ kind: "lost", t_start_ms: 2000, t_end_ms: 4500 }]);
  });

  it("splits when state transitions between weak and lost without passing through good", () => {
    const events = run(
      [
        { state: "weak", t: 1000 },
        { state: "weak", t: 2000 },
        { state: "lost", t: 3000 },
        { state: "lost", t: 4000 },
        { state: "good", t: 5000 },
      ],
      6000,
    );
    expect(events).toEqual([
      { kind: "weak", t_start_ms: 1000, t_end_ms: 3000 },
      { kind: "lost", t_start_ms: 3000, t_end_ms: 5000 },
    ]);
  });

  it("handles multiple distinct events across a session", () => {
    const events = run(
      [
        { state: "good", t: 1000 },
        { state: "weak", t: 2000 },
        { state: "good", t: 3000 },
        { state: "good", t: 4000 },
        { state: "lost", t: 5000 },
        { state: "good", t: 6000 },
        { state: "weak", t: 7000 },
      ],
      8000,
    );
    expect(events).toEqual([
      { kind: "weak", t_start_ms: 2000, t_end_ms: 3000 },
      { kind: "lost", t_start_ms: 5000, t_end_ms: 6000 },
      { kind: "weak", t_start_ms: 7000, t_end_ms: 8000 },
    ]);
  });

  it("emits nothing when state never leaves good even with finalize", () => {
    let state = initialDetectorState();
    state = step(state, "good", 100).next;
    state = step(state, "good", 200).next;
    expect(finalize(state, 500)).toBeNull();
  });
});

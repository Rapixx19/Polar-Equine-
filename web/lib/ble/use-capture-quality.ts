"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  aggregateSummary,
  computeCorrectionRate,
  deriveState,
  emptySummary,
  freezeSummary,
  type QualityState,
  type QualitySummary,
} from "@/lib/ble/capture-quality";
import type { HRSample } from "@/lib/ble/hr-codec";

const ROLLING_WINDOW_MS = 30_000;
const AGGREGATE_TICK_MS = 1_000;

export type CaptureQuality = {
  state: QualityState;
  summary: QualitySummary;
  freeze: () => QualitySummary;
};

// Single source of truth for capture quality (per spec correctness
// guarantees #1-5). Both the live badge (B) and the saved-page summary (C)
// derive from this hook — never from raw RR streams.
export function useCaptureQuality(latestSample: HRSample | undefined): CaptureQuality {
  const [state, setState] = useState<QualityState>("good");
  const [summary, setSummary] = useState<QualitySummary>(emptySummary());
  const rrBufferRef = useRef<{ rr: number; t: number }[]>([]);
  // Lazily initialised on first tick/sample to keep the useRef initializer
  // pure (react-hooks/purity disallows performance.now() here).
  const lastSampleAtRef = useRef<number | null>(null);
  const frozenRef = useRef(false);
  const frozenSummaryRef = useRef<QualitySummary | null>(null);

  // Push every new sample's RR(s) into the rolling buffer.
  useEffect(() => {
    if (!latestSample) return;
    const now = performance.now();
    lastSampleAtRef.current = now;
    for (const rr of latestSample.rr_ms) {
      rrBufferRef.current.push({ rr, t: now });
    }
    // Trim to the rolling window — O(k) where k = expired entries, amortized O(1).
    const cutoff = now - ROLLING_WINDOW_MS;
    while (rrBufferRef.current.length > 0 && rrBufferRef.current[0].t < cutoff) {
      rrBufferRef.current.shift();
    }
  }, [latestSample]);

  // 1 Hz aggregate tick: derive current state, update summary incrementally.
  useEffect(() => {
    const id = window.setInterval(() => {
      // Pre-first-sample: treat as "fresh" so the badge stays good until
      // a real silence (5 s without notifications) elapses post-mount.
      const last = lastSampleAtRef.current ?? performance.now();
      if (frozenRef.current) {
        // After freeze: still keep deriving the live state for the badge,
        // but don't mutate summary. (Component may unmount soon anyway.)
        const rr = rrBufferRef.current.map((e) => e.rr);
        const corrRate = computeCorrectionRate(rr);
        const ms = performance.now() - last;
        const s = deriveState({
          contact: latestSample?.contact ?? "unsupported",
          correctionRate: corrRate,
          msSinceLastSample: ms,
        });
        setState(s);
        return;
      }
      const rr = rrBufferRef.current.map((e) => e.rr);
      const corrRate = computeCorrectionRate(rr);
      const ms = performance.now() - last;
      const s = deriveState({
        contact: latestSample?.contact ?? "unsupported",
        correctionRate: corrRate,
        msSinceLastSample: ms,
      });
      setState(s);
      setSummary((prev) => aggregateSummary(prev, s));
    }, AGGREGATE_TICK_MS);
    return () => window.clearInterval(id);
  }, [latestSample]);

  const freeze = useCallback((): QualitySummary => {
    const frozen = freezeSummary(summary, frozenSummaryRef.current);
    frozenRef.current = true;
    frozenSummaryRef.current = frozen;
    return frozen;
  }, [summary]);

  return { state, summary, freeze };
}

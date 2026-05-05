"use client";

import { useEffect, useRef } from "react";

import { useCaptureQuality, type CaptureQuality } from "@/lib/ble/use-capture-quality";
import { acquireWakeLock, releaseWakeLock } from "@/lib/ble/wake-lock";
import type { HRSample } from "@/lib/ble/hr-codec";

type Args = {
  active: boolean;
  sessionId: string | null;
  latestSample: HRSample | undefined;
};

// Glue: wires capture-quality + wake-lock + sessionStorage write on stop
// transition. Kept out of SessionRecorder so that file stays under the
// 150-line cap and orchestration logic is testable in isolation.
export function useCaptureSession({ active, sessionId, latestSample }: Args): CaptureQuality {
  const quality = useCaptureQuality(latestSample);
  const prevActiveRef = useRef(false);
  const sessionIdAtStartRef = useRef<string | null>(null);

  // Acquire on start, release on stop. Sentinel 'release' listener
  // re-acquires while active (in wake-lock.ts).
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      sessionIdAtStartRef.current = sessionId;
      void acquireWakeLock(() => prevActiveRef.current);
    } else if (!active && prevActiveRef.current) {
      const id = sessionIdAtStartRef.current;
      const summary = quality.freeze();
      if (id) sessionStorage.setItem(`quality:${id}`, JSON.stringify(summary));
      void releaseWakeLock();
    }
    prevActiveRef.current = active;
  }, [active, sessionId, quality]);

  // Re-acquire on visibility return.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && prevActiveRef.current) {
        void acquireWakeLock(() => prevActiveRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return quality;
}

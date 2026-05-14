"use client";

import { useEffect, useRef } from "react";

import type { QualityState } from "@/lib/ble/capture-quality";
import {
  finalize,
  initialDetectorState,
  step,
  type DetectorState,
  type SignalEvent,
} from "@/lib/quality/transition-detector";

type Args = {
  active: boolean;
  sessionId: string | null;
  startedAt: number | null;
  state: QualityState;
};

// Subscribes to the live quality state, runs the transition detector, and
// POSTs each sealed event to the session's signal-events endpoint. Also
// emits a short navigator.vibrate() pulse when the band transitions from
// good → lost so the rider feels an alert even with the phone in a pocket.
//
// Failures are logged, never thrown: a lost POST shouldn't crash the
// recording session. The DB row is "nice to have" for the admin overlay;
// the live banner runs off the in-memory state regardless.
export function useQualityEvents({ active, sessionId, startedAt, state }: Args) {
  const detectorRef = useRef<DetectorState>(initialDetectorState());
  const lastStateRef = useRef<QualityState>("good");
  const wasActiveRef = useRef(false);

  // React to every state change (1 Hz tick from useCaptureQuality).
  useEffect(() => {
    if (!active || !sessionId || startedAt === null) return;
    if (state === lastStateRef.current) return;
    const tMs = Math.max(0, Date.now() - startedAt);
    const { next, emit } = step(detectorRef.current, state, tMs);
    detectorRef.current = next;
    lastStateRef.current = state;
    if (state === "lost") tryVibrate();
    if (emit) void post(sessionId, [emit]);
  }, [active, sessionId, startedAt, state]);

  // On stop, seal any in-flight event so the admin overlay doesn't miss
  // a quality drop that happened to coincide with the rider tapping End.
  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      return;
    }
    if (!wasActiveRef.current) return;
    wasActiveRef.current = false;
    const id = sessionId;
    const start = startedAt;
    if (!id || start === null) {
      detectorRef.current = initialDetectorState();
      lastStateRef.current = "good";
      return;
    }
    const tMs = Math.max(0, Math.round(performance.now() + performance.timeOrigin - start));
    const tail = finalize(detectorRef.current, tMs);
    detectorRef.current = initialDetectorState();
    lastStateRef.current = "good";
    if (tail) void post(id, [tail]);
  }, [active, sessionId, startedAt]);
}

async function post(sessionId: string, events: SignalEvent[]): Promise<void> {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/signal-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      console.warn("[signal-events] post non-ok", { status: res.status, count: events.length });
    }
  } catch (err) {
    console.warn("[signal-events] post failed", err);
  }
}

function tryVibrate(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([120, 60, 120]);
    }
  } catch {
    // Vibration API can throw on some embedded browsers; never let it
    // break the recording flow.
  }
}

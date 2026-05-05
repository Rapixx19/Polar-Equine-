"use client";

import type { IngestState } from "@/lib/ble/use-ingest-session";

type Props = {
  state: IngestState;
  startDisabled: boolean;
  onStart: () => void;
  onEnd: () => void;
};

// Extracted from SessionRecorder to keep that file under the 150-line cap
// (slice 11.75 added useCaptureSession + PreSessionGuard + CaptureQualityBadge).
// No 180-line exemption is invoked — the buttons are a clean, self-contained slice.
export function RecorderButtons({ state, startDisabled, onStart, onEnd }: Props) {
  if (state === "off") {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={startDisabled}
        className="w-full rounded-md bg-emerald-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Start session
      </button>
    );
  }

  if (state === "recording" || state === "stopping") {
    const isStopping = state === "stopping";
    return (
      <button
        type="button"
        onClick={onEnd}
        disabled={isStopping}
        className="w-full rounded-md bg-rose-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStopping ? "Saving session…" : "End session"}
      </button>
    );
  }

  return null;
}

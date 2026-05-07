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
  if (state === "off" || state === "error") {
    const label = state === "error" ? "Try again" : "Start session";
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={startDisabled}
        className="w-full rounded-md bg-[var(--lime)] px-5 py-3 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--text-faint)] disabled:opacity-100"
      >
        {label}
      </button>
    );
  }

  if (state === "starting") {
    return (
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-md bg-[var(--border)] px-5 py-3 text-sm font-medium text-[var(--text-faint)]"
      >
        Starting session…
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
        className="w-full rounded-md bg-[var(--red)] px-5 py-3 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStopping ? "Saving session…" : "End session"}
      </button>
    );
  }

  return null;
}

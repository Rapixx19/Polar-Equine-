"use client";

import type { QualityState } from "@/lib/ble/capture-quality";

type Props = {
  state: QualityState;
};

// Live alert that pops above the recorder when the strap quality drops.
// Sibling to the existing CaptureQualityBadge but louder — the badge is a
// passive status chip, this banner is a "do something" prompt that takes
// vertical space and uses aria-live="assertive" so screen readers
// interrupt rather than wait for a polite slot.
export function SignalQualityBanner({ state }: Props) {
  if (state === "good") return null;
  const isLost = state === "lost";
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={
        isLost
          ? "flex items-start gap-2 rounded-md border border-[var(--red)] bg-[var(--red)]/10 p-3 text-sm text-[var(--red)]"
          : "flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700"
      }
    >
      <span aria-hidden>{isLost ? "🔴" : "⚠"}</span>
      <span>
        {isLost ? (
          <>
            <strong>Lost contact.</strong>{" "}
            The band stopped sending heart-rate frames. Check that the strap
            is on, snug, and that the contact patches are wet.
          </>
        ) : (
          <>
            <strong>Signal noisy.</strong>{" "}
            The band is moving on the horse. Re-seat the strap so the
            electrodes sit flat against the skin. Data from this period will
            be flagged for review.
          </>
        )}
      </span>
    </div>
  );
}

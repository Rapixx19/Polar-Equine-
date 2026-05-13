"use client";

import Link from "next/link";
import { useState } from "react";

import type { ActivityType } from "@/lib/activities";

// V0.2 home flow: one big primary CTA for riding (the 95% case), with the
// long tail of non-riding activities hidden behind a disclosure toggle.
// Drops the activity grid + subtype picker that came before.

const NON_RIDING: Array<{ activity: ActivityType; emoji: string; label: string }> = [
  { activity: "grass_field", emoji: "🌳", label: "Field" },
  { activity: "walker", emoji: "🔄", label: "Walker" },
  { activity: "stall", emoji: "🏠", label: "Stall" },
  { activity: "transport", emoji: "🚚", label: "Transport" },
  { activity: "vet", emoji: "🩺", label: "Vet" },
];

export function StartRecordingPanel() {
  const [showOther, setShowOther] = useState(false);

  return (
    <div className="mb-6">
      <Link
        href="/start/horse?activity=riding"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] px-6 py-4 text-base font-medium text-[var(--canvas)] transition hover:opacity-90"
      >
        <span aria-hidden>▶</span>
        Start recording
      </Link>

      <button
        type="button"
        onClick={() => setShowOther((v) => !v)}
        aria-expanded={showOther}
        className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--lime)]"
      >
        Other type of session
        <span aria-hidden className={`transition-transform ${showOther ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {showOther ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {NON_RIDING.map((tile) => (
            <Link
              key={tile.activity}
              href={`/start/horse?activity=${tile.activity}`}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 text-center transition hover:border-[var(--lime)]"
            >
              <span aria-hidden className="text-2xl">{tile.emoji}</span>
              <span className="text-xs font-medium text-[var(--text)]">{tile.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

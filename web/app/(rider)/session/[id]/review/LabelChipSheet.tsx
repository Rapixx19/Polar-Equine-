"use client";

import { useState } from "react";

import {
  formatTimeRange,
  GAIT_LABELS,
  type GaitLabel,
} from "@/lib/session/segments";

import type { ReviewBlock } from "./ReviewClient";

type Props = {
  block: ReviewBlock;
  onCancel: () => void;
  onSave: (label: GaitLabel, jumpCount: number) => void;
};

const LABEL_NAME: Record<GaitLabel, string> = {
  halt: "Halt",
  walk: "Walk",
  trot: "Trot",
  canter: "Canter",
  jump: "Jump",
  not_sure: "Not sure",
};

export function LabelChipSheet({ block, onCancel, onSave }: Props) {
  const [label, setLabel] = useState<GaitLabel>(block.corrected_label);
  const [jumpCount, setJumpCount] = useState<number>(block.jump_count);

  const showJumps = label === "jump" || label === "canter" || jumpCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full rounded-t-3xl border-t border-[var(--border)] bg-[var(--canvas)] p-5">
        <header className="mb-4">
          <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">
            {formatTimeRange(block.start_ms, block.end_ms)}
            {block.avg_bpm > 0 ? ` · ${block.avg_bpm} bpm avg · peak ${block.peak_bpm}` : ""}
          </p>
          <h2 className="mt-1 text-base font-medium">
            We guessed: {LABEL_NAME[block.auto_label]}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            What was your horse really doing here?
          </p>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {GAIT_LABELS.map((g) => {
            const selected = label === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setLabel(g)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  selected
                    ? "border-[var(--lime)] bg-[var(--lime)] text-[var(--canvas)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                }`}
              >
                {LABEL_NAME[g]}
              </button>
            );
          })}
        </div>

        {showJumps ? (
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <span className="text-sm text-[var(--text-faint)]">Jumps in this part</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease jumps"
                onClick={() => setJumpCount((n) => Math.max(0, n - 1))}
                className="size-9 rounded-full border border-[var(--border)] text-lg"
              >
                −
              </button>
              <span className="min-w-6 text-center text-lg tabular-nums">{jumpCount}</span>
              <button
                type="button"
                aria-label="Increase jumps"
                onClick={() => setJumpCount((n) => Math.min(50, n + 1))}
                className="size-9 rounded-full border border-[var(--border)] text-lg"
              >
                +
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-[var(--border)] py-2.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(label, jumpCount)}
            className="flex-1 rounded-md bg-[var(--lime)] py-2.5 text-sm font-medium text-[var(--canvas)]"
          >
            Save change
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { formatTimeRange, type GaitLabel } from "@/lib/session/segments";

import type { ReviewBlock } from "./ReviewClient";

type Props = {
  blocks: ReviewBlock[];
  onBlockTap: (index: number) => void;
};

const LABEL_NAME: Record<GaitLabel, string> = {
  halt: "Halt",
  walk: "Walk",
  trot: "Trot",
  canter: "Canter",
  jump: "Jump",
  not_sure: "Not sure",
};

const LABEL_COLOR: Record<GaitLabel, string> = {
  halt: "bg-[var(--surface)] text-[var(--text-faint)] border-[var(--border)]",
  walk: "bg-blue-500/15 text-blue-200 border-blue-500/40",
  trot: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  canter: "bg-[var(--lime)]/15 text-[var(--lime)] border-[var(--lime)]/40",
  jump: "bg-pink-500/15 text-pink-200 border-pink-500/40",
  not_sure: "bg-[var(--surface)] text-[var(--text-faint)] border-dashed border-[var(--border)]",
};

export function TimelineSegments({ blocks, onBlockTap }: Props) {
  return (
    <ul className="space-y-2" role="list">
      {blocks.map((b) => {
        const changed = b.corrected_label !== b.auto_label;
        const tone = LABEL_COLOR[b.corrected_label];
        return (
          <li key={b.index}>
            <button
              type="button"
              onClick={() => onBlockTap(b.index)}
              aria-label={`Part ${b.index + 1}, ${formatTimeRange(b.start_ms, b.end_ms)}, ${LABEL_NAME[b.corrected_label]}`}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${tone}`}
            >
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide opacity-80">
                  {formatTimeRange(b.start_ms, b.end_ms)}
                  {b.avg_bpm > 0 ? ` · ${b.avg_bpm} bpm avg` : ""}
                </span>
                <span className="text-base font-medium">
                  {LABEL_NAME[b.corrected_label]}
                  {b.jump_count > 0 ? ` · ${b.jump_count} jump${b.jump_count > 1 ? "s" : ""}` : ""}
                </span>
              </div>
              <span className="text-xs opacity-70">
                {changed ? "Edited" : "Tap to change"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

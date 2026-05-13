"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { HRChart } from "@/components/session/HRChart";
import type { AutoSegment, HRSample } from "@/lib/session/gait-classifier";
import { formatDuration, type GaitLabel } from "@/lib/session/segments";

import { LabelChipSheet } from "./LabelChipSheet";
import { TimelineSegments } from "./TimelineSegments";

type Props = {
  sessionId: string;
  samples: HRSample[];
  autoSegments: AutoSegment[];
  algoVersion: string;
};

export type ReviewBlock = {
  index: number;
  start_ms: number;
  end_ms: number;
  auto_label: GaitLabel;
  corrected_label: GaitLabel;
  jump_count: number;
  avg_bpm: number;
  peak_bpm: number;
};

function blocksFromSegments(segments: AutoSegment[]): ReviewBlock[] {
  return segments.map((s, i) => ({
    index: i,
    start_ms: s.start_ms,
    end_ms: s.end_ms,
    auto_label: s.label,
    corrected_label: s.label,
    jump_count: 0,
    avg_bpm: s.avg_bpm,
    peak_bpm: s.peak_bpm,
  }));
}

export function ReviewClient({
  sessionId,
  samples,
  autoSegments,
  algoVersion,
}: Props) {
  const router = useRouter();
  const initial = useMemo(() => blocksFromSegments(autoSegments), [autoSegments]);
  const [blocks, setBlocks] = useState<ReviewBlock[]>(initial);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const NOTES_MAX = 500;

  const changedCount = blocks.filter((b) => b.corrected_label !== b.auto_label || b.jump_count > 0).length;
  const allHaveLabels = blocks.every((b) => b.corrected_label !== "not_sure");
  const coveredMs = blocks.length === 0 ? 0 : blocks[blocks.length - 1].end_ms - blocks[0].start_ms;

  function applyBlock(index: number, label: GaitLabel, jumpCount: number) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.index === index ? { ...b, corrected_label: label, jump_count: jumpCount } : b,
      ),
    );
    setActiveIdx(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const trimmedNotes = notes.trim();
      const res = await fetch(`/api/sessions/${sessionId}/labels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          algo_version: algoVersion,
          blocks: blocks.map((b) => ({
            start_ms: b.start_ms,
            end_ms: b.end_ms,
            auto_label: b.auto_label,
            corrected_label: b.corrected_label,
            jump_count: b.jump_count,
          })),
          ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "save_failed");
        setSubmitting(false);
        return;
      }
      router.replace("/home?labeled=1");
    } catch {
      setError("network_error");
      setSubmitting(false);
    }
  }

  const active = activeIdx === null ? null : blocks[activeIdx] ?? null;

  const chartSegments = useMemo(
    () =>
      blocks.map((b) => ({
        start_ms: b.start_ms,
        end_ms: b.end_ms,
        label: b.corrected_label,
      })),
    [blocks],
  );

  return (
    <>
      <div className="mb-5">
        <HRChart samples={samples} segments={chartSegments} durationMs={coveredMs} />
        <p className="mt-2 text-xs text-[var(--text-faint)]">
          Heart-rate trace, color-shaded by our guess. Tap any part below to correct it.
        </p>
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Our guess</h2>
        <p className="text-xs text-[var(--text-faint)]">
          {formatDuration(coveredMs)} · {blocks.length} part{blocks.length === 1 ? "" : "s"}
          {changedCount > 0 ? ` · ${changedCount} edited` : ""}
        </p>
      </div>

      <TimelineSegments blocks={blocks} onBlockTap={(i) => setActiveIdx(i)} />

      <div className="mt-6">
        <label
          htmlFor="session-notes"
          className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-faint)]"
        >
          What did you work on?
        </label>
        <textarea
          id="session-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
          rows={3}
          placeholder="Notes for yourself — flying changes, jump course, fresh after travel…"
          className="w-full resize-y rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        />
        <p className="mt-1 text-right text-xs text-[var(--text-faint)]">
          {notes.length}/{NOTES_MAX}
        </p>
      </div>

      <div className="h-24" aria-hidden />

      {error ? (
        <p className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]">
          Could not save ({error}). Tap Approve again to retry.
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--canvas)] p-4">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            disabled={submitting || !allHaveLabels}
            onClick={submit}
            className="w-full rounded-md bg-[var(--lime)] py-3 text-sm font-medium text-[var(--canvas)] transition disabled:opacity-40"
          >
            {submitting
              ? "Saving…"
              : changedCount === 0
                ? "Approve as-is"
                : `Save ${changedCount} correction${changedCount > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {active ? (
        <LabelChipSheet
          block={active}
          onCancel={() => setActiveIdx(null)}
          onSave={(label, jumpCount) => applyBlock(active.index, label, jumpCount)}
        />
      ) : null}
    </>
  );
}

export type { GaitLabel };

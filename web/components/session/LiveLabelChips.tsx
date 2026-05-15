"use client";

import { useState } from "react";

import { LIVE_LABELS, type LiveLabel } from "@/lib/session/live-labels";

type Props = {
  sessionId: string | null;
  startedAt: number | null;
};

type RecentTap = { id: string; t_ms: number; label: LiveLabel; ok: boolean };

const LABEL_STYLE: Record<LiveLabel, string> = {
  halt: "bg-[var(--surface)] text-[var(--text-faint)] border-[var(--border)]",
  walk: "bg-blue-500/15 text-blue-200 border-blue-500/40",
  trot: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  canter: "bg-[var(--lime)]/15 text-[var(--lime)] border-[var(--lime)]/40",
  jump: "bg-pink-500/15 text-pink-200 border-pink-500/40",
};

const LABEL_TEXT: Record<LiveLabel, string> = {
  halt: "Halt",
  walk: "Walk",
  trot: "Trot",
  canter: "Canter",
  jump: "Jump",
};

// Jump is an event, not a state — tapping it doesn't pin "current gait".
const STATE_LABELS = new Set<LiveLabel>(["halt", "walk", "trot", "canter"]);

function fmtMmSs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

export function LiveLabelChips({ sessionId, startedAt }: Props) {
  // What the rider last said the horse is doing now. Visual sticky; the
  // database holds every tap as a separate row, so this is purely UI hint.
  const [current, setCurrent] = useState<LiveLabel | null>(null);
  const [recent, setRecent] = useState<RecentTap[]>([]);
  const [pending, setPending] = useState<LiveLabel | null>(null);

  if (!sessionId || !startedAt) return null;

  async function logTap(label: LiveLabel) {
    if (pending) return; // debounce double-taps
    // eslint-disable-next-line react-hooks/purity -- event handler, not render path
    const now = Date.now();
    const t_ms = now - startedAt!;
    if (t_ms < 0) return; // clock skew guard

    setPending(label);
    if (STATE_LABELS.has(label)) setCurrent(label);

    const optimistic: RecentTap = {
      id: `local-${now}`,
      t_ms,
      label,
      ok: true,
    };
    setRecent((prev) => [optimistic, ...prev].slice(0, 5));

    try {
      const res = await fetch(`/api/sessions/${sessionId}/live-labels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t_ms, label }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as { id: string };
      setRecent((prev) =>
        prev.map((r) => (r.id === optimistic.id ? { ...r, id: json.id } : r)),
      );
    } catch {
      setRecent((prev) =>
        prev.map((r) => (r.id === optimistic.id ? { ...r, ok: false } : r)),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-label="Live gait labels"
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-faint)]">
        Tap the gait as it happens
      </p>
      <div className="grid grid-cols-5 gap-2">
        {LIVE_LABELS.map((label) => {
          const isCurrent = STATE_LABELS.has(label) && current === label;
          const isPending = pending === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => void logTap(label)}
              disabled={pending !== null}
              aria-pressed={isCurrent}
              className={`rounded-xl border p-3 text-sm font-medium transition active:scale-95 disabled:opacity-60 ${
                LABEL_STYLE[label]
              } ${isCurrent ? "ring-2 ring-[var(--lime)]" : ""} ${
                isPending ? "animate-pulse" : ""
              }`}
            >
              {LABEL_TEXT[label]}
            </button>
          );
        })}
      </div>
      {recent.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
          {recent.slice(0, 3).map((r) => (
            <li key={r.id} className="tabular-nums">
              <span className="opacity-60">{fmtMmSs(r.t_ms)}</span>{" "}
              <span>{LABEL_TEXT[r.label]}</span>
              {!r.ok && <span className="ml-2 text-amber-500">⚠ not saved</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

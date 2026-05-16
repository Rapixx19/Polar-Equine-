"use client";

import { useState } from "react";

import {
  JUMP_COUNT_OPTIONS,
  LIVE_LABELS,
  type LiveLabel,
} from "@/lib/session/live-labels";

type Props = {
  sessionId: string | null;
  startedAt: number | null;
};

type RecentTap = {
  id: string;
  t_ms: number;
  label: LiveLabel;
  jump_count: number | null;
  ok: boolean;
};

const LABEL_STYLE: Record<LiveLabel, string> = {
  warm_up: "bg-[var(--surface)] text-[var(--text-faint)] border-[var(--border)]",
  walk: "bg-blue-500/15 text-blue-200 border-blue-500/40",
  trot: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  gallop: "bg-[var(--lime)]/15 text-[var(--lime)] border-[var(--lime)]/40",
  jump: "bg-pink-500/15 text-pink-200 border-pink-500/40",
};

const LABEL_TEXT: Record<LiveLabel, string> = {
  warm_up: "Warm-up",
  walk: "Walk",
  trot: "Trot",
  gallop: "Gallop",
  jump: "Jump",
};

// Jump is an event, not a state — tapping it doesn't pin "current gait".
const STATE_LABELS = new Set<LiveLabel>(["warm_up", "walk", "trot", "gallop"]);
const GAIT_CHIPS = LIVE_LABELS.filter((l) => l !== "jump");

function fmtMmSs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

function tapDescriptor(tap: RecentTap): string {
  if (tap.label === "jump" && tap.jump_count != null) {
    return `Jump × ${tap.jump_count}`;
  }
  return LABEL_TEXT[tap.label];
}

export function LiveLabelChips({ sessionId, startedAt }: Props) {
  const [current, setCurrent] = useState<LiveLabel | null>(null);
  const [recent, setRecent] = useState<RecentTap[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  if (!sessionId || !startedAt) return null;

  async function logTap(label: LiveLabel, jumpCount: number | null = null) {
    const tapKey = label === "jump" ? `jump-${jumpCount}` : label;
    if (pending) return;
    // eslint-disable-next-line react-hooks/purity -- event handler
    const now = Date.now();
    const t_ms = now - startedAt!;
    if (t_ms < 0) return;

    setPending(tapKey);
    if (STATE_LABELS.has(label)) setCurrent(label);

    const optimistic: RecentTap = {
      id: `local-${now}`,
      t_ms,
      label,
      jump_count: jumpCount,
      ok: true,
    };
    setRecent((prev) => [optimistic, ...prev].slice(0, 5));

    try {
      const body: Record<string, unknown> = { t_ms, label };
      if (label === "jump" && jumpCount != null) body.jump_count = jumpCount;
      const res = await fetch(`/api/sessions/${sessionId}/live-labels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
      <div className="grid grid-cols-4 gap-2">
        {GAIT_CHIPS.map((label) => {
          const isCurrent = current === label;
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

      <p className="mt-3 mb-2 text-xs uppercase tracking-wide text-[var(--text-faint)]">
        Jump count — tap before or after the jump
      </p>
      <div className="grid grid-cols-5 gap-2">
        {JUMP_COUNT_OPTIONS.map((n) => {
          const tapKey = `jump-${n}`;
          const isPending = pending === tapKey;
          return (
            <button
              key={n}
              type="button"
              onClick={() => void logTap("jump", n)}
              disabled={pending !== null}
              aria-label={`Log ${n} jump${n > 1 ? "s" : ""}`}
              className={`rounded-xl border p-3 text-sm font-medium transition active:scale-95 disabled:opacity-60 ${
                LABEL_STYLE.jump
              } ${isPending ? "animate-pulse" : ""}`}
            >
              ×{n}
            </button>
          );
        })}
      </div>

      {recent.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
          {recent.slice(0, 3).map((r) => (
            <li key={r.id} className="tabular-nums">
              <span className="opacity-60">{fmtMmSs(r.t_ms)}</span>{" "}
              <span>{tapDescriptor(r)}</span>
              {!r.ok && <span className="ml-2 text-amber-500">⚠ not saved</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

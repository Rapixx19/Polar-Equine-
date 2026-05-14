"use client";

import { useState, useTransition } from "react";

import type { HorseRollup } from "@/lib/admin/horse-rollup";

const TEXT_MAX = 500;

function fmtPct(x: number | null): string {
  if (x == null) return "—";
  return `${Math.round(x * 100)}%`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "never";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

function ProgressCell({
  value,
  target,
  unit,
}: {
  value: number;
  target: number | null;
  unit: string;
}) {
  if (target == null || target <= 0) {
    return (
      <span className="text-xs text-[var(--text-faint)]">
        {value}
        {unit} <span className="text-[var(--text-faint)]">/ no goal</span>
      </span>
    );
  }
  const pct = Math.min(1, value / target);
  const over = value > target;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={`h-full ${over ? "bg-emerald-400" : "bg-[var(--lime)]"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-[var(--text-muted)]">
        {value}
        {unit}/{target}
        {unit}
      </span>
    </div>
  );
}

export function HorseRosterTable({ rollups }: { rollups: HorseRollup[] }) {
  const [editing, setEditing] = useState<HorseRollup | null>(null);

  return (
    <>
      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            Horse objectives ({rollups.length})
          </h2>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
            Targets steer what data each horse contributes
          </p>
        </div>

        {rollups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            No horses yet — riders create them at their first session.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                <tr>
                  <th className="px-4 py-2 text-left font-normal">Horse</th>
                  <th className="px-4 py-2 text-left font-normal">Sessions goal</th>
                  <th className="px-4 py-2 text-left font-normal">Minutes goal</th>
                  <th className="px-4 py-2 text-left font-normal">Last</th>
                  <th className="px-4 py-2 text-right font-normal">Tailor</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((h) => (
                  <tr
                    key={h.id}
                    className="border-t border-[var(--border)] hover:bg-[var(--canvas)]"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text)]">{h.name}</span>
                        {h.admin_notes && (
                          <span
                            title={h.admin_notes}
                            className="rounded-full border border-[var(--lime)]/60 bg-[var(--lime)]/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--lime)]"
                          >
                            note
                          </span>
                        )}
                      </div>
                      {h.session_pct != null && (
                        <p className="text-[10px] text-[var(--text-faint)]">
                          sessions {fmtPct(h.session_pct)}
                          {h.minutes_pct != null && ` · minutes ${fmtPct(h.minutes_pct)}`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <ProgressCell
                        value={h.session_count}
                        target={h.target_session_count}
                        unit=""
                      />
                    </td>
                    <td className="px-4 py-2">
                      <ProgressCell
                        value={Math.round(h.total_ride_minutes)}
                        target={h.target_ride_minutes}
                        unit="m"
                      />
                    </td>
                    <td className="px-4 py-2 text-[var(--text-muted)]">
                      {relativeTime(h.last_session_at)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(h)}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--lime)] hover:text-[var(--lime)]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <HorseEditDrawer horse={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function HorseEditDrawer({ horse, onClose }: { horse: HorseRollup; onClose: () => void }) {
  const [targetSessions, setTargetSessions] = useState(
    horse.target_session_count != null ? String(horse.target_session_count) : "",
  );
  const [targetMinutes, setTargetMinutes] = useState(
    horse.target_ride_minutes != null ? String(horse.target_ride_minutes) : "",
  );
  const [adminNotes, setAdminNotes] = useState(horse.admin_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function parseIntOrNull(raw: string, max: number): number | null | "bad" {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0 || n > max) return "bad";
    return n;
  }

  function save() {
    setError(null);
    setSaved(false);
    const sessionsNext = parseIntOrNull(targetSessions, 9999);
    if (sessionsNext === "bad") {
      setError("Sessions target must be 0–9999 (blank for no goal)");
      return;
    }
    const minutesNext = parseIntOrNull(targetMinutes, 99999);
    if (minutesNext === "bad") {
      setError("Minutes target must be 0–99999 (blank for no goal)");
      return;
    }
    const patch: Record<string, unknown> = {};
    if (sessionsNext !== (horse.target_session_count ?? null)) {
      patch.target_session_count = sessionsNext;
    }
    if (minutesNext !== (horse.target_ride_minutes ?? null)) {
      patch.target_ride_minutes = minutesNext;
    }
    const notesNext = adminNotes.trim() === "" ? null : adminNotes;
    if (notesNext !== (horse.admin_notes ?? null)) {
      patch.admin_notes = notesNext;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    start(async () => {
      const res = await fetch(`/api/admin/horses/${horse.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `request_failed_${res.status}`);
        return;
      }
      setSaved(true);
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 400);
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--canvas)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Tailor horse</p>
            <h2 className="text-xl font-light text-[var(--text)]">{horse.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-muted)]">Target sessions</span>
              <input
                type="number"
                min={0}
                max={9999}
                value={targetSessions}
                onChange={(e) => setTargetSessions(e.target.value)}
                placeholder="—"
                disabled={pending}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-muted)]">Target minutes</span>
              <input
                type="number"
                min={0}
                max={99999}
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
                placeholder="—"
                disabled={pending}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
              />
            </label>
          </div>
          <p className="text-[10px] text-[var(--text-faint)]">
            Leave blank to remove the goal. Progress bars only show when a target is set.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-muted)]">
              Admin notes <span className="text-[var(--text-faint)]">(private)</span>
            </span>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value.slice(0, TEXT_MAX))}
              rows={3}
              maxLength={TEXT_MAX}
              placeholder="e.g. focus on lunging sessions; prototype-mount candidate"
              disabled={pending}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1 text-[10px] text-[var(--text-faint)]">
              {adminNotes.length}/{TEXT_MAX}
            </p>
          </label>

          {error && (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="rounded-md border border-[var(--lime)]/40 bg-[var(--lime)]/10 px-3 py-2 text-xs text-[var(--lime)]">
              Saved.
            </p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-end gap-2 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:border-[var(--lime)] hover:text-[var(--lime)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md border border-[var(--lime)] bg-[var(--lime)] px-3 py-1.5 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--lime)]/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

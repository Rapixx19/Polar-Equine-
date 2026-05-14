"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import type { RiderRollup } from "@/lib/admin/dashboard-rollup";

import { Sparkline } from "./Sparkline";

const TEXT_MAX = 500;

function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function fmtScore(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toFixed(2);
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

function Progress({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full bg-[var(--lime)]"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-[var(--text-muted)]">
        {value}/{target}
      </span>
    </div>
  );
}

export function RosterTable({ rollups }: { rollups: RiderRollup[] }) {
  const [editing, setEditing] = useState<RiderRollup | null>(null);
  const [inactiveOnly, setInactiveOnly] = useState(false);

  const visible = useMemo(
    () => (inactiveOnly ? rollups.filter((r) => !r.active_last_7d) : rollups),
    [rollups, inactiveOnly],
  );

  return (
    <>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">Roster ({visible.length})</h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={inactiveOnly}
              onChange={(e) => setInactiveOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--lime)]"
            />
            Show inactive only (no session in 7d)
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            {inactiveOnly ? "Every rider has recorded this week — nice." : "No rider profiles yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                <tr>
                  <th className="px-4 py-2 text-left font-normal">Rider</th>
                  <th className="px-4 py-2 text-left font-normal">Quota</th>
                  <th className="px-4 py-2 text-right font-normal">Dataset</th>
                  <th className="px-4 py-2 text-right font-normal">Prototype</th>
                  <th className="px-4 py-2 text-right font-normal">Quality</th>
                  <th className="px-4 py-2 text-left font-normal">Last</th>
                  <th className="px-4 py-2 text-left font-normal">14d</th>
                  <th className="px-4 py-2 text-right font-normal">Tailor</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--canvas)]">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/riders/${r.id}`}
                          className="font-medium text-[var(--text)] hover:text-[var(--lime)]"
                        >
                          {r.display_name}
                        </Link>
                        {r.is_admin && (
                          <span className="rounded-full bg-[var(--lime)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--canvas)]">
                            admin
                          </span>
                        )}
                        {r.next_focus && (
                          <span
                            title={r.next_focus}
                            className="rounded-full border border-[var(--lime)]/60 bg-[var(--lime)]/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--lime)]"
                          >
                            focus
                          </span>
                        )}
                      </div>
                      {r.program_end_date && (
                        <p className="text-[10px] text-[var(--text-faint)]">
                          ends {r.program_end_date}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Progress value={r.session_count} target={r.session_quota_target} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {fmtPct(r.pct_of_dataset)}
                      <span className="ml-1 text-[10px] text-[var(--text-faint)]">
                        ({r.total_ride_minutes.toFixed(0)}m)
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {r.prototype_session_count}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {fmtScore(r.avg_quality)}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-muted)]">
                      {relativeTime(r.last_session_at)}
                    </td>
                    <td className="px-4 py-2">
                      <Sparkline values={r.daily_sessions} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
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

      {editing && (
        <RiderEditDrawer
          rider={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RiderEditDrawer({ rider, onClose }: { rider: RiderRollup; onClose: () => void }) {
  const [quota, setQuota] = useState(String(rider.session_quota_target));
  const [endDate, setEndDate] = useState(rider.program_end_date ?? "");
  const [adminNotes, setAdminNotes] = useState(rider.admin_notes ?? "");
  const [nextFocus, setNextFocus] = useState(rider.next_focus ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const n = Number.parseInt(quota, 10);
    if (!Number.isFinite(n) || n < 1 || n > 9999) {
      setError("Quota must be 1–9999");
      return;
    }
    const patch: Record<string, unknown> = {};
    if (n !== rider.session_quota_target) patch.session_quota_target = n;
    const dateNext = endDate || null;
    if (dateNext !== (rider.program_end_date ?? null)) patch.program_end_date = dateNext;
    const notesNext = adminNotes.trim() === "" ? null : adminNotes;
    if (notesNext !== (rider.admin_notes ?? null)) patch.admin_notes = notesNext;
    const focusNext = nextFocus.trim() === "" ? null : nextFocus;
    if (focusNext !== (rider.next_focus ?? null)) patch.next_focus = focusNext;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    start(async () => {
      const res = await fetch(`/api/admin/riders/${rider.id}`, {
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
      // Give the rider page time to reflect the change. Reload pulls fresh
      // server data for the dashboard so the row updates inline.
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 400);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--canvas)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Tailor rider</p>
            <h2 className="text-xl font-light text-[var(--text)]">{rider.display_name}</h2>
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
              <span className="mb-1 block text-xs text-[var(--text-muted)]">Session quota</span>
              <input
                type="number"
                min={1}
                max={9999}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                disabled={pending}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-muted)]">Program ends</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={pending}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-muted)]">
              Admin notes <span className="text-[var(--text-faint)]">(private)</span>
            </span>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value.slice(0, TEXT_MAX))}
              rows={3}
              maxLength={TEXT_MAX}
              placeholder="e.g. prefers Apollo, contact via WhatsApp"
              disabled={pending}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1 text-[10px] text-[var(--text-faint)]">
              {adminNotes.length}/{TEXT_MAX}
            </p>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-muted)]">
              Next focus <span className="text-[var(--text-faint)]">(rider sees this on home)</span>
            </span>
            <textarea
              value={nextFocus}
              onChange={(e) => setNextFocus(e.target.value.slice(0, TEXT_MAX))}
              rows={3}
              maxLength={TEXT_MAX}
              placeholder="e.g. record a lunging session this week"
              disabled={pending}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1 text-[10px] text-[var(--text-faint)]">
              {nextFocus.length}/{TEXT_MAX}
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

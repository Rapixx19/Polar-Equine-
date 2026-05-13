"use client";

import { useState, useTransition } from "react";

type Rider = {
  id: string;
  display_name: string;
  is_admin: boolean | null;
  session_quota_target: number;
  program_end_date: string | null;
  total_sessions: number | null;
  created_at: string | null;
};

export function RiderRow({ rider }: { rider: Rider }) {
  const [quota, setQuota] = useState(String(rider.session_quota_target));
  const [endDate, setEndDate] = useState(rider.program_end_date ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(patch: { session_quota_target?: number; program_end_date?: string | null }) {
    start(async () => {
      setError(null);
      setSaved(false);
      const res = await fetch(`/api/admin/riders/${rider.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setError("Save failed");
        return;
      }
      setSaved(true);
    });
  }

  function commitQuota() {
    const n = Number.parseInt(quota, 10);
    if (!Number.isFinite(n) || n < 1 || n > 9999) {
      setQuota(String(rider.session_quota_target));
      return;
    }
    if (n === rider.session_quota_target) return;
    save({ session_quota_target: n });
  }

  function commitEndDate() {
    const next = endDate || null;
    if (next === (rider.program_end_date ?? null)) return;
    save({ program_end_date: next });
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-base font-medium text-[var(--text)]">
          {rider.display_name}
          {rider.is_admin ? (
            <span className="ml-2 rounded-full bg-[var(--lime)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--canvas)]">
              admin
            </span>
          ) : null}
        </p>
        <p className="text-xs text-[var(--text-faint)]">
          {rider.total_sessions ?? 0} session{rider.total_sessions === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--text-muted)]">Session quota</span>
          <input
            type="number"
            min={1}
            max={9999}
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            onBlur={commitQuota}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            disabled={pending}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-[var(--text-muted)]">Program ends</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            onBlur={commitEndDate}
            disabled={pending}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--lime)] focus:outline-none disabled:opacity-50"
          />
        </label>
      </div>

      <div className="mt-2 h-4 text-xs">
        {error ? (
          <span className="text-[var(--red)]">{error}</span>
        ) : pending ? (
          <span className="text-[var(--text-faint)]">Saving…</span>
        ) : saved ? (
          <span className="text-[var(--lime)]">Saved</span>
        ) : null}
      </div>
    </div>
  );
}

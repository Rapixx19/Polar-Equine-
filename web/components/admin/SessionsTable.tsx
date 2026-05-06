import Link from "next/link";

import { activityLabel } from "@/components/session/ActivityTile";
import { RIDING_SUBTYPE_UI, type ActivityType, type RidingSubtype } from "@/lib/activities";
import type { AdminSessionRow } from "@/lib/admin/queries";

type Props = {
  rows: AdminSessionRow[];
  showRider?: boolean;
};

function fmtAbs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function fmtDuration(start: string, end: string | null): string {
  if (!end) return "—";
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return "—";
  const total = Math.round((e - s) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

function activityCell(row: AdminSessionRow): string {
  const base = activityLabel(row.activity_type as ActivityType);
  if ((row.activity_type === "riding" || row.activity_type === "lunging") && row.riding_subtype) {
    const ui = RIDING_SUBTYPE_UI[row.riding_subtype as RidingSubtype];
    if (ui) return `${base} · ${ui.label}`;
  }
  if (row.activity_type === "other" && row.activity_note) {
    return `${base} · ${row.activity_note}`;
  }
  return base;
}

function StatusChip({ value }: { value: string | null }) {
  if (!value) return <span className="text-[var(--text-faint)]">—</span>;
  const tone =
    value === "completed" || value === "complete" || value === "succeeded"
      ? "text-[var(--lime)]"
      : value === "failed"
        ? "text-[var(--red)]"
        : "text-[var(--text-muted)]";
  return <span className={`text-xs uppercase tracking-wide ${tone}`}>{value}</span>;
}

export function SessionsTable({ rows, showRider = true }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
        No sessions match these filters.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
          <tr>
            <th className="px-3 py-2">Start</th>
            {showRider && <th className="px-3 py-2">Rider</th>}
            <th className="px-3 py-2">Horse</th>
            <th className="px-3 py-2">Activity</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Metrics</th>
            <th className="px-3 py-2">Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface)]">
              <td className="px-3 py-2 tabular-nums">
                <Link
                  href={`/admin/sessions/${r.id}`}
                  className="text-[var(--text)] hover:text-[var(--lime)]"
                  title={r.start_time}
                >
                  {fmtAbs(r.start_time)}
                </Link>
              </td>
              {showRider && (
                <td className="px-3 py-2 text-[var(--text-muted)]">
                  {r.rider?.display_name ?? `rider_${r.rider?.id?.slice(0, 8) ?? "?"}`}
                </td>
              )}
              <td className="px-3 py-2">{r.horse?.name ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{activityCell(r)}</td>
              <td className="px-3 py-2">
                <StatusChip value={r.status} />
              </td>
              <td className="px-3 py-2">
                <StatusChip value={r.metrics_status} />
              </td>
              <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                {fmtDuration(r.start_time, r.end_time)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";

import { Pagination } from "@/components/admin/Pagination";
import { listComputeJobs } from "@/lib/admin/queries";
import { createServerSupabaseClient } from "@/lib/auth/server";

const STATUS_VALUES = ["all", "queued", "running", "succeeded", "failed"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

function pickStatus(v: string | undefined): StatusFilter {
  return (STATUS_VALUES as readonly string[]).includes(v ?? "")
    ? (v as StatusFilter)
    : "failed";
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.valueOf())) return v;
  return d.toLocaleString();
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = pickStatus(sp.status);

  const supabase = await createServerSupabaseClient();
  const { rows, total, page, pageSize } = await listComputeJobs(supabase, {
    page: pageNum,
    status,
  });

  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-light">Compute jobs</h1>
        <span className="text-xs text-[var(--text-faint)]">{total} matching</span>
      </header>

      <div className="mb-4 flex flex-wrap gap-1">
        {STATUS_VALUES.map((s) => {
          const active = s === status;
          const href = s === "failed" ? "/admin/jobs" : `/admin/jobs?status=${s}`;
          return (
            <Link
              key={s}
              href={href}
              className={
                active
                  ? "rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--lime)]"
                  : "rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              }
            >
              {s}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          No jobs match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
              <tr>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Last error</th>
                <th className="px-3 py-2">Next run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="border-t border-[var(--border)] hover:bg-[var(--surface)]">
                  <td className="px-3 py-2 text-[var(--text-muted)]">{fmtDate(j.created_at)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/sessions/${j.session_id}`}
                      className="text-xs text-[var(--text)] hover:text-[var(--lime)]"
                    >
                      <code>{j.session_id.slice(0, 8)}…</code>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">
                    {j.session?.activity_type ?? "—"}
                  </td>
                  <td className="px-3 py-2">{j.job_type}</td>
                  <td className="px-3 py-2 uppercase tracking-wide text-[var(--text-muted)]">
                    {j.status}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{j.attempts}</td>
                  <td
                    className="max-w-[280px] truncate px-3 py-2 text-[var(--text-muted)]"
                    title={j.last_error ?? ""}
                  >
                    {j.last_error ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{fmtDate(j.next_run_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/admin/jobs"
        page={page}
        pageSize={pageSize}
        total={total}
        searchParams={{ status: status === "failed" ? undefined : status }}
      />
    </section>
  );
}

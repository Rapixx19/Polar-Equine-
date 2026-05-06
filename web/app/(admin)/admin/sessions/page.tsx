import { Pagination } from "@/components/admin/Pagination";
import { SessionsFilterBar } from "@/components/admin/SessionsFilterBar";
import { SessionsTable } from "@/components/admin/SessionsTable";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { listAllSessions } from "@/lib/admin/queries";

const STATUS_VALUES = ["all", "active", "completed", "abandoned"] as const;
const METRICS_VALUES = ["all", "pending", "complete", "failed"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];
type MetricsFilter = (typeof METRICS_VALUES)[number];

function pickStatus(v: string | undefined): StatusFilter {
  return (STATUS_VALUES as readonly string[]).includes(v ?? "")
    ? (v as StatusFilter)
    : "all";
}
function pickMetrics(v: string | undefined): MetricsFilter {
  return (METRICS_VALUES as readonly string[]).includes(v ?? "")
    ? (v as MetricsFilter)
    : "all";
}

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; metrics?: string }>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = pickStatus(sp.status);
  const metrics = pickMetrics(sp.metrics);

  const supabase = await createServerSupabaseClient();
  const { rows, total, page, pageSize } = await listAllSessions(supabase, {
    page: pageNum,
    status,
    metrics,
  });

  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-light">All sessions</h1>
        <span className="text-xs text-[var(--text-faint)]">
          Read-only · {total} total
        </span>
      </header>

      <SessionsFilterBar basePath="/admin/sessions" status={status} metrics={metrics} />
      <SessionsTable rows={rows} />
      <Pagination
        basePath="/admin/sessions"
        page={page}
        pageSize={pageSize}
        total={total}
        searchParams={{ status: status === "all" ? undefined : status, metrics: metrics === "all" ? undefined : metrics }}
      />
    </section>
  );
}

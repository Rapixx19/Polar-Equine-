import Link from "next/link";
import { redirect } from "next/navigation";

import { JobsCard } from "@/components/admin/JobsCard";
import { MetricsCard } from "@/components/admin/MetricsCard";
import { SamplesPreview } from "@/components/admin/SamplesPreview";
import { SessionContextChip } from "@/components/session/SessionContextChip";
import type { ActivityType, RidingSubtype } from "@/lib/activities";
import { getSessionDetail } from "@/lib/admin/queries";
import { createServerSupabaseClient } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtAbs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return iso;
  return d.toLocaleString();
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
  return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
}

export default async function AdminSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/admin/sessions");

  const supabase = await createServerSupabaseClient();
  const detail = await getSessionDetail(supabase, id);
  if (!detail) redirect("/admin/sessions");

  const { session, metrics, jobs, sampleCount, samplesPreview } = detail;
  const riderLabel =
    session.rider?.display_name?.trim() ??
    `rider_${session.rider_id.slice(0, 8)}`;
  const horseLabel = session.horse?.name ?? `horse_${session.horse_id.slice(0, 8)}`;

  return (
    <article className="space-y-6">
      <div>
        <Link
          href="/admin/sessions"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← All sessions
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-light">{horseLabel}</h1>
        <p className="text-sm text-[var(--text-muted)]">{riderLabel}</p>
        <div className="mt-3">
          <SessionContextChip
            activity={session.activity_type as ActivityType}
            ridingSubtype={(session.riding_subtype as RidingSubtype | null) ?? null}
            activityNote={session.activity_note}
          />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-sm md:grid-cols-4">
        <Field label="Status" value={session.status ?? "—"} />
        <Field label="Metrics" value={session.metrics_status ?? "—"} />
        <Field label="Started" value={fmtAbs(session.start_time)} />
        <Field label="Ended" value={fmtAbs(session.end_time)} />
        <Field label="Duration" value={fmtDuration(session.start_time, session.end_time)} />
        <Field label="Session ID" value={<code className="text-xs">{session.id}</code>} />
        <Field label="Horse ID" value={<code className="text-xs">{session.horse_id}</code>} />
        <Field label="Rider ID" value={<code className="text-xs">{session.rider_id}</code>} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Session metrics
        </h2>
        <MetricsCard metrics={metrics} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Compute jobs
        </h2>
        <JobsCard jobs={jobs} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">
          HR samples preview
        </h2>
        <SamplesPreview samples={samplesPreview} total={sampleCount} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Manual actions
        </h2>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--text-muted)]">
          <p className="mb-2">No mutation buttons in V0. Use Supabase Studio for edits/deletes, or run:</p>
          <pre className="overflow-x-auto whitespace-pre rounded bg-[var(--canvas)] p-3 text-[var(--text)]">
{`# Re-trigger compute pipeline for this session
curl -X POST "$ALGO_BASE_URL/recompute" \\
  -H "content-type: application/json" \\
  -d '{"session_id":"${session.id}"}'`}
          </pre>
        </div>
      </section>
    </article>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-faint)]">{label}</div>
      <div className="text-[var(--text)]">{value}</div>
    </div>
  );
}

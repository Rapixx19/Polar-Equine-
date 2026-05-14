import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { activityLabel } from "@/components/session/ActivityTile";
import type { ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { aggregateBucket, type BucketAggregate } from "@/lib/prototype/aggregate";
import { fetchBucketRows } from "@/lib/prototype/fetch-quality";

import { PrototypeInsightClient, type PrototypeInsight } from "./PrototypeInsightClient";

export const dynamic = "force-dynamic";

type PrototypeSessionRow = {
  id: string;
  activity_type: ActivityType;
  start_time: string;
  end_time: string | null;
  status: string;
  horses: { name: string | null } | null;
  rider_profiles: { display_name: string | null } | null;
};

function durationMinutes(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `${Math.round(ms / 60_000)} min`;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return digits === 0 ? Math.round(n).toString() : n.toFixed(digits);
}

type Metric = {
  label: string;
  baseline: number | null;
  prototype: number | null;
  digits: number;
  higherIsBetter: boolean;
  unit?: string;
};

function buildMetrics(b: BucketAggregate, p: BucketAggregate): Metric[] {
  return [
    { label: "Sessions", baseline: b.session_count, prototype: p.session_count, digits: 0, higherIsBetter: true },
    { label: "Total minutes", baseline: b.total_duration_min, prototype: p.total_duration_min, digits: 1, higherIsBetter: true, unit: "min" },
    { label: "Avg ride (min)", baseline: b.avg_duration_min, prototype: p.avg_duration_min, digits: 1, higherIsBetter: true, unit: "min" },
    { label: "Bad-signal sec / min", baseline: b.signal_event_seconds_per_min, prototype: p.signal_event_seconds_per_min, digits: 2, higherIsBetter: false },
    { label: "Weak/lost events / session", baseline: b.avg_signal_events_per_session, prototype: p.avg_signal_events_per_session, digits: 2, higherIsBetter: false },
    { label: "RR cleaning quality", baseline: b.avg_rr_cleaning_quality, prototype: p.avg_rr_cleaning_quality, digits: 2, higherIsBetter: true },
    { label: "HRV completeness", baseline: b.avg_hrv_completeness_quality, prototype: p.avg_hrv_completeness_quality, digits: 2, higherIsBetter: true },
    { label: "Workload quality", baseline: b.avg_workload_quality, prototype: p.avg_workload_quality, digits: 2, higherIsBetter: true },
    { label: "HR samples / min", baseline: b.avg_hr_samples_per_min, prototype: p.avg_hr_samples_per_min, digits: 1, higherIsBetter: true },
  ];
}

function winner(m: Metric): "baseline" | "prototype" | null {
  if (m.baseline == null || m.prototype == null) return null;
  if (!Number.isFinite(m.baseline) || !Number.isFinite(m.prototype)) return null;
  if (m.baseline === m.prototype) return null;
  const protoWins = m.higherIsBetter ? m.prototype > m.baseline : m.prototype < m.baseline;
  return protoWins ? "prototype" : "baseline";
}

export default async function AdminPrototypePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) redirect("/home");

  const [baselineRows, prototypeRows, sessionsRes, latestInsightRes] = await Promise.all([
    fetchBucketRows(supabase, false),
    fetchBucketRows(supabase, true),
    supabase
      .from("sessions")
      .select(
        "id, activity_type, start_time, end_time, status, horses(name), rider_profiles(display_name)",
      )
      .eq("has_prototype_mount", true)
      .order("start_time", { ascending: false })
      .limit(50),
    supabase
      .from("prototype_comparison_insights")
      .select(
        "id, generated_at, model, prompt_version, insight_markdown, input_token_count, output_token_count, baseline_session_count, prototype_session_count",
      )
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const sessions = (sessionsRes.data ?? []) as unknown as PrototypeSessionRow[];
  const baseline = aggregateBucket(baselineRows);
  const prototype = aggregateBucket(prototypeRows);
  const metrics = buildMetrics(baseline, prototype);

  const initialInsight: PrototypeInsight | null = latestInsightRes.data
    ? {
        id: latestInsightRes.data.id,
        generated_at: latestInsightRes.data.generated_at,
        model: latestInsightRes.data.model,
        prompt_version: latestInsightRes.data.prompt_version,
        markdown: latestInsightRes.data.insight_markdown,
        input_tokens: latestInsightRes.data.input_token_count,
        output_tokens: latestInsightRes.data.output_token_count,
        baseline_session_count: latestInsightRes.data.baseline_session_count,
        prototype_session_count: latestInsightRes.data.prototype_session_count,
      }
    : null;

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">
              Admin · Prototype mount
            </p>
            <h1 className="text-2xl font-light">Prototype vs baseline</h1>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              Only ended sessions are counted. Active rides have no duration yet.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Riders
            </Link>
            <Link
              href="/admin/sessions"
              className="text-[var(--text-muted)] hover:text-[var(--lime)]"
            >
              Sessions
            </Link>
            <Link href="/home" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Rider view
            </Link>
            <LogoutButton />
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--canvas)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
              <tr>
                <th className="px-4 py-2 text-left font-normal">Metric</th>
                <th className="px-4 py-2 text-right font-normal">Baseline (bare strap)</th>
                <th className="px-4 py-2 text-right font-normal">Prototype (girth mount)</th>
                <th className="px-4 py-2 text-right font-normal">Winner</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const w = winner(m);
                return (
                  <tr key={m.label} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--text-muted)]">{m.label}</td>
                    <td
                      className={
                        "px-4 py-2 text-right tabular-nums " +
                        (w === "baseline" ? "text-[var(--lime)]" : "text-[var(--text)]")
                      }
                    >
                      {fmt(m.baseline, m.digits)}
                      {m.unit ? ` ${m.unit}` : ""}
                    </td>
                    <td
                      className={
                        "px-4 py-2 text-right tabular-nums " +
                        (w === "prototype" ? "text-[var(--lime)]" : "text-[var(--text)]")
                      }
                    >
                      {fmt(m.prototype, m.digits)}
                      {m.unit ? ` ${m.unit}` : ""}
                    </td>
                    <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-[var(--text-faint)]">
                      {w === null ? "—" : w === "prototype" ? "Prototype" : "Baseline"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="mb-6">
          <PrototypeInsightClient
            initial={initialInsight}
            liveBaselineCount={baseline.session_count}
            livePrototypeCount={prototype.session_count}
          />
        </div>

        <section>
          <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">
            Prototype sessions ({sessions.length})
          </h2>
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
              No prototype sessions yet. Riders tick the prototype-mount toggle on the start screen
              when you hand them the girth-mount holder.
            </div>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/sessions/${s.id}`}
                    className="grid grid-cols-12 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] hover:border-[var(--lime)]"
                  >
                    <span className="col-span-3 text-[var(--text-muted)]">
                      {new Date(s.start_time).toLocaleString()}
                    </span>
                    <span className="col-span-3 truncate">
                      {s.rider_profiles?.display_name ?? "—"}
                    </span>
                    <span className="col-span-2 truncate">{s.horses?.name ?? "—"}</span>
                    <span className="col-span-2">{activityLabel(s.activity_type)}</span>
                    <span className="col-span-1 text-[var(--text-muted)]">
                      {durationMinutes(s.start_time, s.end_time)}
                    </span>
                    <span className="col-span-1 text-right text-xs uppercase tracking-wide text-[var(--text-faint)]">
                      {s.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

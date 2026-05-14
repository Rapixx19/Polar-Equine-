import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

import { SessionDetailClient } from "../[id]/SessionDetailClient";
import { buildDemoSession } from "./demo-data";

export const dynamic = "force-dynamic";

export default async function AdminSessionDemoPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) redirect("/home");

  const demo = buildDemoSession();

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--lime)]">
              Admin · Session · DEMO
            </p>
            <h1 className="text-2xl font-light">
              {demo.header.rider_name} · {demo.header.horse_name}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin/sessions" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              ← All sessions
            </Link>
            <LogoutButton />
          </div>
        </header>

        <div className="mb-4 rounded-2xl border border-[var(--lime)]/60 bg-[var(--lime)]/5 p-3 text-xs text-[var(--text-muted)]">
          Synthetic preview — all rows below are generated in-memory. The Generate-insight and
          Download buttons hit real APIs; they will 404 on the placeholder id.
        </div>

        <dl className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Started</dt>
            <dd>{demo.header.started}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Duration</dt>
            <dd>{demo.header.duration}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Activity</dt>
            <dd>{demo.header.activity}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Status</dt>
            <dd className="text-[var(--text-muted)]">{demo.header.status}</dd>
          </div>
        </dl>

        <SessionDetailClient
          sessionId={demo.sessionId}
          samples={demo.samples}
          labels={demo.labels}
          metrics={demo.metrics}
          durationMs={demo.durationMs}
          initialInsight={demo.initialInsight}
          sourceCounts={demo.sourceCounts}
        />
      </div>
    </main>
  );
}

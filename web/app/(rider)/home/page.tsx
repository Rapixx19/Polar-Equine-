import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { BrandMark } from "@/components/BrandMark";
import { Footer } from "@/components/Footer";
import { HomeLiveBanner } from "@/components/home/HomeLiveBanner";
import { HomeRecapCard } from "@/components/home/HomeRecapCard";
import { ActivityTile } from "@/components/session/ActivityTile";
import { ACTIVITY_TYPES } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { fetchHomeSummary } from "@/lib/home/home-summary";
import { isAdminHost } from "@/lib/proxy/admin-host";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("display_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/auth/provision");
  }

  const h = await headers();
  if (profile.is_admin && isAdminHost(h.get("host"))) {
    redirect("/admin/sessions");
  }

  const summary = await fetchHomeSummary(supabase, user.id);
  const initial = (profile.display_name?.trim()?.[0] ?? "?").toUpperCase();
  const sectionTitle = summary.state === "live" ? "Start another session" : "What is the horse doing?";
  const gridActivities = ACTIVITY_TYPES.filter((a) => a !== "other");

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <BrandMark />
          <Avatar initial={initial} />
        </div>

        <header className="mb-6">
          <p className="text-sm text-[var(--text-faint)]">Welcome,</p>
          <h1 className="text-2xl font-light">{profile.display_name}</h1>
          {profile.is_admin && (
            <p className="mt-1 text-xs uppercase tracking-wide text-[var(--lime)]">Admin</p>
          )}
        </header>

        {summary.state === "live" && (
          <HomeLiveBanner
            id={summary.session.id}
            horseName={summary.session.horseName}
            activityLabel={summary.session.activityLabel}
            startedAtRelative={summary.session.startedAtRelative}
          />
        )}
        {summary.state === "recap" && (
          <HomeRecapCard
            id={summary.session.id}
            horseName={summary.session.horseName}
            activityLabel={summary.session.activityLabel}
            endedAtRelative={summary.session.endedAtRelative}
            durationMin={summary.session.durationMin}
            hrAvg={summary.session.hrAvg}
            hrPeak={summary.session.hrPeak}
          />
        )}

        <h2 className="mb-3 text-sm font-medium text-[var(--text-muted)]">{sectionTitle}</h2>
        <div className="grid grid-cols-2 gap-3">
          {gridActivities.map((activity) => (
            <ActivityTile
              key={activity}
              activity={activity}
              variant={activity === "riding" ? "primary" : "standard"}
            />
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/session/new/custom"
            className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] transition hover:text-[var(--lime)]"
          >
            <span aria-hidden className="text-base">
              +
            </span>
            Something else
          </Link>
        </div>

        <Footer />
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { BrandMark } from "@/components/BrandMark";
import { Footer } from "@/components/Footer";
import { HomeLiveBanner } from "@/components/home/HomeLiveBanner";
import { HomeRecapCard } from "@/components/home/HomeRecapCard";
import { NeedsReviewBanner } from "@/components/home/NeedsReviewBanner";
import { StartRecordingPanel } from "@/components/home/StartRecordingPanel";
import { HomeRings } from "@/components/home/research/HomeRings";
import { NextNeeded } from "@/components/home/research/NextNeeded";
import { ResearchProgress } from "@/components/home/research/ResearchProgress";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { fetchHomeSummary } from "@/lib/home/home-summary";
import { fetchProgressContext } from "@/lib/research/fetch-progress";

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

  const [summary, progress] = await Promise.all([
    fetchHomeSummary(supabase, user.id),
    fetchProgressContext(supabase, user.id),
  ]);
  const initial = (profile.display_name?.trim()?.[0] ?? "?").toUpperCase();

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

        <HomeRings ctx={progress} />

        <NeedsReviewBanner supabase={supabase} userId={user.id} />

        {summary.state === "live" && (
          <HomeLiveBanner
            id={summary.session.id}
            horseName={summary.session.horseName}
            activityLabel={summary.session.activityLabel}
            startedAtRelative={summary.session.startedAtRelative}
            looksStuck={summary.session.looksStuck}
          />
        )}

        <ResearchProgress ctx={progress} />
        <NextNeeded ctx={progress} />

        <StartRecordingPanel />

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

        <Footer />
      </div>
    </main>
  );
}

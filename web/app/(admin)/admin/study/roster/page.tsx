import { RiderStudyCard } from "@/components/admin/RiderStudyCard";
import { getStudySettings, listStudyRiders } from "@/lib/admin/study-queries";
import { createServerSupabaseClient } from "@/lib/auth/server";

export default async function StudyRosterPage() {
  const supabase = await createServerSupabaseClient();
  const [settings, riders] = await Promise.all([
    getStudySettings(supabase),
    listStudyRiders(supabase, { includeInactive: true }),
  ]);

  const active = riders.filter((r) => r.is_active);
  const inactive = riders.filter((r) => !r.is_active);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wide text-[var(--text-faint)]">
          Active riders
        </h2>
        <span className="text-xs text-[var(--text-faint)]">
          target {settings.weekly_target_per_rider}/wk · {settings.v0_phase_weeks}wk phase
        </span>
      </header>

      {active.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          No active riders yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((r) => (
            <RiderStudyCard
              key={r.id}
              rider={r}
              weeklyTarget={settings.weekly_target_per_rider}
              v0PhaseWeeks={settings.v0_phase_weeks}
            />
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <>
          <h2 className="text-sm uppercase tracking-wide text-[var(--text-faint)]">
            Inactive
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
            {inactive.map((r) => (
              <RiderStudyCard
                key={r.id}
                rider={r}
                weeklyTarget={settings.weekly_target_per_rider}
                v0PhaseWeeks={settings.v0_phase_weeks}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

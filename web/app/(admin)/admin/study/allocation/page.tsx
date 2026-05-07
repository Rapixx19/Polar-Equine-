import { AllocationTable } from "@/components/admin/AllocationTable";
import {
  getAllocationTargets,
  getStudySettings,
  listSessionsByResearchLabel,
  listStudyRiders,
} from "@/lib/admin/study-queries";
import { createServerSupabaseClient } from "@/lib/auth/server";

export default async function StudyAllocationPage() {
  const supabase = await createServerSupabaseClient();
  const [settings, targets, tallies, riders] = await Promise.all([
    getStudySettings(supabase),
    getAllocationTargets(supabase),
    listSessionsByResearchLabel(supabase),
    listStudyRiders(supabase),
  ]);

  const totalTargetSessions = riders.reduce((acc, r) => {
    return acc + (r.weekly_target_override ?? settings.weekly_target_per_rider) * settings.v0_phase_weeks;
  }, 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-faint)]">
        Target counts derive from {riders.length} active rider{riders.length === 1 ? "" : "s"} ×{" "}
        their weekly target × {settings.v0_phase_weeks}-week phase. Actuals are completed sessions
        auto-mapped from <code>activity_type</code> + <code>riding_subtype</code>.
      </p>
      <AllocationTable
        targets={targets}
        tallies={tallies}
        totalTargetSessions={totalTargetSessions}
      />
      <p className="text-xs text-[var(--text-faint)]">
        A-Trot, A-Canter, A-Gallop, B-Transitions read 0 in this slice — the schema has no gait or
        drill-type field on sessions yet. A future slice will add a rider-side gait tag.
      </p>
    </div>
  );
}

import { HorseStudyCard } from "@/components/admin/HorseStudyCard";
import { listStudyHorses } from "@/lib/admin/study-queries";
import { createServerSupabaseClient } from "@/lib/auth/server";

export default async function StudyHorsesPage() {
  const supabase = await createServerSupabaseClient();
  const horses = await listStudyHorses(supabase);

  const training = horses.filter((h) => !h.is_holdout);
  const holdout = horses.filter((h) => h.is_holdout);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wide text-[var(--text-faint)]">
          Training set
        </h2>
        <span className="text-xs text-[var(--text-faint)]">{training.length} horses</span>
      </header>

      {training.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          No horses yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {training.map((h) => (
            <HorseStudyCard key={h.id} horse={h} />
          ))}
        </div>
      )}

      {holdout.length > 0 && (
        <>
          <h2 className="text-sm uppercase tracking-wide text-[var(--text-faint)]">
            Hold-out set
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {holdout.map((h) => (
              <HorseStudyCard key={h.id} horse={h} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

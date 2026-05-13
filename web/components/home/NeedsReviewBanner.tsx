import Link from "next/link";

import type { createServerSupabaseClient } from "@/lib/auth/server";
import { fetchNeedsReview } from "@/lib/home/needs-review";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function NeedsReviewBanner({
  supabase,
  userId,
}: {
  supabase: Supabase;
  userId: string;
}) {
  const data = await fetchNeedsReview(supabase, userId);
  if (!data) return null;

  const horseRel = data.horse;
  const horse = Array.isArray(horseRel) ? (horseRel[0] ?? null) : horseRel;

  return (
    <Link
      href={`/session/${data.id}/review`}
      className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--lime)] bg-[var(--surface)] p-4 transition hover:bg-[var(--canvas)]"
    >
      <span aria-hidden className="text-xl text-[var(--lime)]">
        ✎
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-[var(--lime)]">Needs review</p>
        <p className="truncate text-sm font-medium text-[var(--text)]">
          Label your last session{horse ? ` with ${horse.name}` : ""}
        </p>
      </div>
      <span className="text-xs text-[var(--text-muted)]">Tap to label</span>
    </Link>
  );
}

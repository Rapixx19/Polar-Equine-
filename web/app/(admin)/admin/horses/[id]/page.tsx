import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/admin/Pagination";
import { SessionsTable } from "@/components/admin/SessionsTable";
import { listSessionsForHorse } from "@/lib/admin/queries";
import { createServerSupabaseClient } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminHorseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/admin/horses");

  const sp = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const supabase = await createServerSupabaseClient();
  const { data: horse } = await supabase
    .from("horses")
    .select("id, name, breed, date_of_birth, owner")
    .eq("id", id)
    .maybeSingle();

  if (!horse) redirect("/admin/horses");

  const { rows, total, page, pageSize } = await listSessionsForHorse(supabase, id, {
    page: pageNum,
  });

  return (
    <section className="space-y-6">
      <div>
        <Link
          href="/admin/horses"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← All horses
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-light">{horse.name}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {horse.breed ?? "Breed unknown"}
          {horse.date_of_birth ? ` · ${horse.date_of_birth}` : ""}
        </p>
      </header>

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Sessions
        </h2>
        <SessionsTable rows={rows} />
        <Pagination
          basePath={`/admin/horses/${id}`}
          page={page}
          pageSize={pageSize}
          total={total}
        />
      </div>
    </section>
  );
}

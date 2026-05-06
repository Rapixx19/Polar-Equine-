import Link from "next/link";

import { listAllHorses } from "@/lib/admin/queries";
import { createServerSupabaseClient } from "@/lib/auth/server";

function fmtDob(v: string | null): string {
  if (!v) return "—";
  return v;
}

export default async function AdminHorsesPage() {
  const supabase = await createServerSupabaseClient();
  const { rows } = await listAllHorses(supabase);

  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-light">Horses</h1>
        <span className="text-xs text-[var(--text-faint)]">{rows.length} total</span>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          No horses yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Breed</th>
                <th className="px-3 py-2">DOB</th>
                <th className="px-3 py-2">ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="border-t border-[var(--border)] hover:bg-[var(--surface)]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/horses/${h.id}`}
                      className="text-[var(--text)] hover:text-[var(--lime)]"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{h.breed ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">
                    {fmtDob(h.date_of_birth)}
                  </td>
                  <td className="px-3 py-2">
                    <code className="text-xs text-[var(--text-faint)]">{h.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
